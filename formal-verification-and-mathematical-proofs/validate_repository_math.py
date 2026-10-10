#!/usr/bin/env python3
"""Audit all repository Markdown mathematics; export to pinned MathJax in CI.

This validator checks rendering syntax, NOT mathematical soundness, physical
reliability, or equivalence between SMT models and ESP32 implementation.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
IGNORED = {".git", "node_modules", ".expo", "build", "dist", ".gradle",
           ".next", "coverage", ".venv", "venv", "__pycache__"}
ALLOWED = {
    "mathbb", "mathcal", "mathbf", "mathrm", "Delta", "Phi",
    "dots", "quad", "qquad", "bigl", "bigr", "bmod", "in",
    "begin", "end", "ne", "land", "lor", "le", "ge", "neg",
    "Longrightarrow", "Longleftrightarrow", "Rightarrow",
    "exists", "forall", "mapsto", "left", "right",
    "cdot", "times", "equiv", "to", "frac", "geq", "leq",
}
BANNED = {"operatorname", "textbf", "text", "newcommand", "def",
          "href", "require", "htmlClass", "htmlId", "htmlStyle"}
ENVS = {"aligned", "gathered", "cases"}

def verify(expr, where):
    assert expr.strip(), f"{where}: empty formula"
    for name in re.findall(r"\\([A-Za-z]+)", expr):
        assert name not in BANNED, f"{where}: banned macro \\{name}"
        assert name in ALLOWED, f"{where}: unreviewed command \\{name}"
    stripped = re.sub(r"\\[{}]", "", expr)
    depth = 0
    for char in stripped:
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            assert depth >= 0, f"{where}: extra closing brace"
    assert depth == 0, f"{where}: unbalanced braces"
    begin = re.findall(r"\\begin\{([a-zA-Z*]+)\}", expr)
    end = re.findall(r"\\end\{([a-zA-Z*]+)\}", expr)
    assert begin == end, f"{where}: unbalanced environments {begin} {end}"
    assert set(begin) <= ENVS, f"{where}: unreviewed environment"
    assert expr.count(r"\left") == expr.count(r"\right"), f"{where}: left/right mismatch"

def extract(text, filename):
    equations = []
    fence = None
    math_lines = None
    started = 0
    math_delim = False
    def add(tex, line, mode):
        verify(tex, f"{filename}:{line}")
        equations.append({"path": filename, "line": line, "mode": mode, "tex": tex.strip()})
    for lineno, line in enumerate(text.splitlines(), 1):
        marker = re.match(r"^\s*(`{3,}|~{3,})([A-Za-z0-9_-]*)\s*$", line)
        if marker:
            ticks, lang = marker.groups()
            if fence is None:
                fence = (ticks[0], len(ticks), lang)
                started = lineno
                if lang == "math":
                    math_lines = []
                continue
            if ticks[0] == fence[0] and len(ticks) >= fence[1] and lang == "":
                if fence[2] == "math":
                    add("\n".join(math_lines), started, "display")
                fence, math_lines = None, None
                continue
        if fence is not None:
            if fence[2] == "math":
                math_lines.append(line)
            continue
        # Remove inline code spans before scanning for math delimiters.
        normal = re.sub(r"(`+)(.*?)\1", "", line)
        if normal.strip() == "$$":
            if math_delim:
                add("\n".join(math_lines), started, "display")
                math_lines, math_delim = None, False
            else:
                started, math_lines, math_delim = lineno, [], True
            continue
        if math_delim:
            math_lines.append(normal)
            continue
        for m in re.finditer(r"(?<!\\)\$\$(.+?)\$\$", normal):
            add(m.group(1), lineno, "display")
        normal = re.sub(r"(?<!\\)\$\$(.+?)\$\$", "", normal)
        for m in re.finditer(r"(?<!\\)(?<!\$)\$(?!\$)(.+?)(?<!\\)\$(?!\$)", normal):
            add(m.group(1), lineno, "inline")
    assert fence is None, f"{filename}:{started}: unclosed Markdown fence"
    assert not math_delim, f"{filename}:{started}: unclosed $$ expression"
    return equations

def main():
    for invalid in (r"\operatorname{SAT}(x)", r"\textbf{UNSAT}",
                    r"\text{bad}", r"x_{2", r"\unknown{x}",
                    r"\begin{cases}x", r"\left(x"):
        try:
            verify(invalid, "negative-self-test")
        except AssertionError:
            pass
        else:
            raise AssertionError(f"Validator accepts invalid example: {invalid}")
    files = sorted(
        p for p in ROOT.rglob("*")
        if p.is_file() and p.suffix.lower() in {".md", ".mdx"}
        and not any(seg in IGNORED for seg in p.relative_to(ROOT).parts)
    )
    assert len(files) >= 20, "Repository-wide Markdown scope unexpectedly reduced"
    expressions = []
    for file in files:
        expressions += extract(file.read_text(encoding="utf-8"),
                               file.relative_to(ROOT).as_posix())
    display = sum(x["mode"] == "display" for x in expressions)
    inline = len(expressions) - display
    assert display >= 36, f"Proof formulas disappeared: {display} displayed < 36"
    assert inline >= 30, f"Inline mathematical expressions disappeared: {inline} < 30"
    math_files = {x["path"] for x in expressions if x["mode"] == "display"}
    for doc in ("EXACT_THEOREMS.md", "PROOF_SCOPE_AND_REPRODUCTION.md",
                "SOS_COUNTER_INDUCTION.md"):
        assert f"formal-verification-and-mathematical-proofs/{doc}" in math_files
    if "--json" in sys.argv:
        print(json.dumps(expressions, ensure_ascii=False))
    else:
        print(f"Repository-wide GitHub math syntax PASS: {len(files)} Markdown files, "
              f"{display} displayed equations and {inline} inline expressions; "
              "negative probes and macro/fence/brace/environment checks PASS")

if __name__ == "__main__":
    main()
