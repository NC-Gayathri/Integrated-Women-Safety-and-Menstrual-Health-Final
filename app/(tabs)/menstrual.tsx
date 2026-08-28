// menstrual.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  TextInput,
  ScrollView,
  FlatList,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AmbientBackground } from "@/components/ui/AmbientBackground";

type CycleEntry = {
  id: string;
  startDate: string; // "YYYY-MM-DD"
  endDate?: string;
  length?: number;
};

type SymptomEntry = {
  id: string;
  date: string; // "YYYY-MM-DD"
  symptoms: string;
  mood: string;
  notes: string;
};

type ReminderEntry = {
  id: string;
  title: string;
  dateTime: string; // free text / "YYYY-MM-DD HH:mm"
};

const formatDate = (d: Date) => d.toISOString().split("T")[0];

const parseDate = (value: string) => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const getFertileWindow = (lastStart: string, cycleLength: number) => {
  const start = parseDate(lastStart);
  if (!start) return null;

  // Simple model: ovulation ~ 14 days before next period
  const ovulationDay = new Date(start);
  ovulationDay.setDate(ovulationDay.getDate() + (cycleLength - 14));

  const windowStart = new Date(ovulationDay);
  windowStart.setDate(windowStart.getDate() - 2);

  const windowEnd = new Date(ovulationDay);
  windowEnd.setDate(windowEnd.getDate() + 1);

  return {
    ovulation: formatDate(ovulationDay),
    start: formatDate(windowStart),
    end: formatDate(windowEnd),
  };
};

const getCyclePhase = (lastStart: string, cycleLength: number) => {
  const start = parseDate(lastStart);
  if (!start) return { phase: "Unknown", tip: "Enter your last period date to see tailored tips." };

  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  const dayInCycle = (Math.floor(diffMs / (1000 * 60 * 60 * 24)) % cycleLength + cycleLength) % cycleLength + 1;

  if (dayInCycle <= 5) {
    return {
      phase: "Menstrual Phase",
      tip: "Rest, stay hydrated, and prioritize iron-rich foods. Gentle stretching or light walks can help with cramps.",
    };
  } else if (dayInCycle <= 13) {
    return {
      phase: "Follicular Phase",
      tip: "Energy usually rises now. It’s a good time for learning, planning, and trying more intense workouts.",
    };
  } else if (dayInCycle <= 16) {
    return {
      phase: "Ovulation Phase",
      tip: "You may feel more social and confident. Stay hydrated and include antioxidant-rich foods (fruits/veggies).",
    };
  } else {
    return {
      phase: "Luteal Phase",
      tip: "Mood swings and cravings can show up. Focus on good sleep, balanced meals, and calming activities.",
    };
  }
};

export default function MenstrualScreen() {
  // Period / cycle tracker
  const [lastPeriodStart, setLastPeriodStart] = useState<string>(formatDate(new Date()));
  const [cycleLength, setCycleLength] = useState<string>("28");
  const [cycleHistory, setCycleHistory] = useState<CycleEntry[]>([]);

  // Symptom logging
  const [symptomDate, setSymptomDate] = useState<string>(formatDate(new Date()));
  const [symptoms, setSymptoms] = useState<string>("");
  const [mood, setMood] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [symptomLogs, setSymptomLogs] = useState<SymptomEntry[]>([]);

  // Reminders
  const [reminderTitle, setReminderTitle] = useState<string>("");
  const [reminderDateTime, setReminderDateTime] = useState<string>("");
  const [reminders, setReminders] = useState<ReminderEntry[]>([]);

  const numericCycleLength = useMemo(() => {
    const n = parseInt(cycleLength, 10);
    return isNaN(n) || n <= 0 ? 28 : n;
  }, [cycleLength]);

  const fertileWindow = useMemo(
    () => getFertileWindow(lastPeriodStart, numericCycleLength),
    [lastPeriodStart, numericCycleLength]
  );

  const phaseInfo = useMemo(
    () => getCyclePhase(lastPeriodStart, numericCycleLength),
    [lastPeriodStart, numericCycleLength]
  );

  const nextPeriodDate = useMemo(() => {
    const start = parseDate(lastPeriodStart);
    if (!start) return null;
    const next = new Date(start);
    next.setDate(next.getDate() + numericCycleLength);
    return formatDate(next);
  }, [lastPeriodStart, numericCycleLength]);

  const averageCycleLength = useMemo(() => {
    if (cycleHistory.length === 0) return null;
    const vals = cycleHistory
      .map((c) => c.length)
      .filter((v): v is number => typeof v === "number");

    if (vals.length === 0) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.round(sum / vals.length);
  }, [cycleHistory]);

  const handleSaveCycle = () => {
    const start = parseDate(lastPeriodStart);
    if (!start) {
      Alert.alert("Invalid date", "Please use the format YYYY-MM-DD.");
      return;
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 4); // pretend 5-day period for history
    const length = numericCycleLength;

    const newEntry: CycleEntry = {
      id: `${Date.now()}`,
      startDate: formatDate(start),
      endDate: formatDate(end),
      length,
    };

    setCycleHistory((prev) => [newEntry, ...prev]);
    Alert.alert("Saved", "Cycle added to history.");
  };

  const handleAddSymptomLog = () => {
    if (!symptoms && !mood && !notes) {
      Alert.alert("Add details", "Please log at least one field (symptoms, mood, or notes).");
      return;
    }
    const date = parseDate(symptomDate) ? symptomDate : formatDate(new Date());
    const newEntry: SymptomEntry = {
      id: `${Date.now()}`,
      date,
      symptoms,
      mood,
      notes,
    };
    setSymptomLogs((prev) => [newEntry, ...prev]);
    setSymptoms("");
    setMood("");
    setNotes("");
    Alert.alert("Logged", "Your symptoms have been saved.");
  };

  const handleAddReminder = () => {
    if (!reminderTitle || !reminderDateTime) {
      Alert.alert("Missing info", "Please enter both title and date/time.");
      return;
    }
    const newRem: ReminderEntry = {
      id: `${Date.now()}`,
      title: reminderTitle,
      dateTime: reminderDateTime,
    };
    setReminders((prev) => [newRem, ...prev]);
    setReminderTitle("");
    setReminderDateTime("");
    Alert.alert(
      "Reminder saved",
      "This app currently keeps reminders inside the app. You can connect real push notifications later with expo-notifications."
    );
  };

  return (
    <AmbientBackground style={styles.container} accentColor="#FCE4EC">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.title}>🌸 Menstrual Health</Text>
          <Text style={styles.subtitle}>
            Intelligent Cycle Tracking, Symptoms & Phase Guidance
          </Text>
        </View>

        {/* Period Tracker Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Period Tracker</Text>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>Cycle Log</Text>
            </View>
          </View>
          <Text style={styles.cardText}>
            Record your period start date and cycle length to generate insights.
          </Text>

          <Text style={styles.inputLabel}>Last Period Start (YYYY-MM-DD)</Text>
          <TextInput
            value={lastPeriodStart}
            onChangeText={setLastPeriodStart}
            placeholder="2025-01-01"
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Average Cycle Length (days)</Text>
          <TextInput
            value={cycleLength}
            onChangeText={setCycleLength}
            keyboardType="number-pad"
            placeholder="28"
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <View style={styles.infoBanner}>
            <Text style={styles.infoLabel}>Estimated Next Period:</Text>
            <Text style={styles.infoValue}>{nextPeriodDate ?? "-"}</Text>
          </View>

          <TouchableOpacity
            style={styles.buttonWrapper}
            activeOpacity={0.85}
            onPress={handleSaveCycle}
          >
            <LinearGradient
              colors={["#ab47bc", "#8e24aa"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Save Cycle to History</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Fertile Window Tracker Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Fertile Window Tracker</Text>
            <View style={[styles.badgePill, { backgroundColor: "#fce4ec" }]}>
              <Text style={[styles.badgePillText, { color: "#c2185b" }]}>Ovulation</Text>
            </View>
          </View>
          <Text style={styles.cardText}>
            Estimates your fertile window and ovulation day based on your cycle inputs.
          </Text>
          {fertileWindow ? (
            <View style={styles.fertileBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Fertile Window:</Text>
                <Text style={styles.infoValue}>
                  {fertileWindow.start} → {fertileWindow.end}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Estimated Ovulation:</Text>
                <Text style={styles.infoValue}>{fertileWindow.ovulation}</Text>
              </View>
              <Text style={styles.smallNote}>
                Note: This is an estimated indicator and should not replace medical guidance.
              </Text>
            </View>
          ) : (
            <Text style={styles.smallNote}>Enter a valid period start date above.</Text>
          )}
        </View>

        {/* Health Tips by Cycle Phase Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Cycle Phase</Text>
          <View style={styles.phaseHeaderRow}>
            <Text style={styles.phaseTitle}>{phaseInfo.phase}</Text>
          </View>
          <Text style={styles.phaseTipText}>{phaseInfo.tip}</Text>
        </View>

        {/* Reminders Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reminders & Alerts</Text>
          <Text style={styles.cardText}>
            Schedule medication or self-care reminders.
          </Text>

          <Text style={styles.inputLabel}>Reminder Title</Text>
          <TextInput
            value={reminderTitle}
            onChangeText={setReminderTitle}
            placeholder="Take iron supplement"
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Date & Time</Text>
          <TextInput
            value={reminderDateTime}
            onChangeText={setReminderDateTime}
            placeholder="2025-11-20 09:00"
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <TouchableOpacity
            style={styles.buttonWrapper}
            activeOpacity={0.85}
            onPress={handleAddReminder}
          >
            <LinearGradient
              colors={["#ab47bc", "#8e24aa"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Add Reminder</Text>
            </LinearGradient>
          </TouchableOpacity>

          {reminders.length > 0 && (
            <View style={styles.sectionList}>
              <Text style={styles.sectionTitle}>Saved Reminders</Text>
              {reminders.map((r) => (
                <View key={r.id} style={styles.listItem}>
                  <Text style={styles.listItemTitle}>• {r.title}</Text>
                  <Text style={styles.listItemSubtitle}>{r.dateTime}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Symptom Logging Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Symptom Logging</Text>
          <Text style={styles.cardText}>Track physical symptoms, mood, and personal notes.</Text>

          <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={symptomDate}
            onChangeText={setSymptomDate}
            placeholder="2025-11-15"
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Symptoms</Text>
          <TextInput
            value={symptoms}
            onChangeText={setSymptoms}
            placeholder="Cramps, bloating, headache..."
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Mood</Text>
          <TextInput
            value={mood}
            onChangeText={setMood}
            placeholder="Anxious, calm, tired..."
            placeholderTextColor="#9c88b0"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes..."
            placeholderTextColor="#9c88b0"
            style={[styles.input, styles.inputMultiline]}
            multiline
          />

          <TouchableOpacity
            style={styles.buttonWrapper}
            activeOpacity={0.85}
            onPress={handleAddSymptomLog}
          >
            <LinearGradient
              colors={["#ab47bc", "#8e24aa"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Save Symptom Log</Text>
            </LinearGradient>
          </TouchableOpacity>

          {symptomLogs.length > 0 && (
            <View style={styles.sectionList}>
              <Text style={styles.sectionTitle}>Recent Symptom Logs</Text>
              <FlatList
                data={symptomLogs}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.listItem}>
                    <Text style={styles.listItemTitle}>{item.date}</Text>
                    {!!item.symptoms && (
                      <Text style={styles.listItemSubtitle}>Symptoms: {item.symptoms}</Text>
                    )}
                    {!!item.mood && (
                      <Text style={styles.listItemSubtitle}>Mood: {item.mood}</Text>
                    )}
                    {!!item.notes && (
                      <Text style={styles.listItemSubtitle}>Notes: {item.notes}</Text>
                    )}
                  </View>
                )}
              />
            </View>
          )}
        </View>

        {/* Cycle History & Reports Card */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.cardTitle}>Cycle History & Reports</Text>
          <Text style={styles.cardText}>
            Saved cycles help track long-term health trends.
          </Text>

          {averageCycleLength && (
            <View style={styles.infoBanner}>
              <Text style={styles.infoLabel}>Average Cycle Length:</Text>
              <Text style={styles.infoValue}>{averageCycleLength} days</Text>
            </View>
          )}

          {cycleHistory.length > 0 ? (
            <View style={styles.sectionList}>
              <Text style={styles.sectionTitle}>Past Cycles</Text>
              {cycleHistory.map((c) => (
                <View key={c.id} style={styles.listItem}>
                  <Text style={styles.listItemTitle}>
                    {c.startDate} → {c.endDate}
                  </Text>
                  {typeof c.length === "number" && (
                    <Text style={styles.listItemSubtitle}>Length: {c.length} days</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.smallNote}>
              Save cycles from the Period Tracker card to build your history log.
            </Text>
          )}
        </View>
      </ScrollView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1C0D2B",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    color: "#6E5A80",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    shadowColor: "#0F031D",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    ...(Platform.OS === "web" && {
      boxShadow: "0px 4px 14px rgba(15, 3, 29, 0.06)",
    }),
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1C0D2B",
  },
  badgePill: {
    backgroundColor: "#f3e8f7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8e24aa",
  },
  cardText: {
    fontSize: 13,
    color: "#6b5b7b",
    marginBottom: 14,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4a148c",
    marginTop: 6,
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#f7f2fa",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.2)",
    fontSize: 14,
    color: "#2a0845",
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  buttonWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 14,
    elevation: 3,
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  infoBanner: {
    backgroundColor: "#fcf8fd",
    padding: 12,
    borderRadius: 14,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.15)",
  },
  fertileBox: {
    backgroundColor: "#fff0f5",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(233, 30, 99, 0.2)",
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 3,
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6a1b9a",
    marginRight: 6,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8e24aa",
  },
  phaseHeaderRow: {
    backgroundColor: "#f3e8f7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 10,
    marginTop: 4,
  },
  phaseTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#8e24aa",
  },
  phaseTipText: {
    fontSize: 14,
    color: "#2a0845",
    lineHeight: 21,
  },
  smallNote: {
    fontSize: 11,
    color: "#7b688b",
    marginTop: 8,
    fontStyle: "italic",
  },
  sectionList: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    color: "#4a148c",
  },
  listItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(142, 36, 170, 0.1)",
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2a0845",
  },
  listItemSubtitle: {
    fontSize: 12,
    color: "#6b5b7b",
    marginTop: 2,
  },
});
  