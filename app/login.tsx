import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { AuthService, getFriendlyAuthErrorMessage } from "@/services/AuthService";

WebBrowser.maybeCompleteAuthSession();

const googleDiscovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

export default function LoginScreen() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const validateEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password;

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert("Missing information", "Please enter both email and password.");
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      await AuthService.login(trimmedEmail, trimmedPassword);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      console.log("Error during login:", e);
      const errorMessage = getFriendlyAuthErrorMessage(e);
      Alert.alert("Login Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push("/forgot-password");
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const res = await AuthService.loginWithGoogle();
      if (res) {
        router.replace("/(tabs)/home");
      }
    } catch (e: any) {
      console.log("Google Sign-In Error:", e);
      const errMsg = getFriendlyAuthErrorMessage(e);
      Alert.alert("Google Sign-In Failed", errMsg);
    } finally {
      setLoading(false);
    }
  };



  const handleAppleSignIn = async () => {
    const appleClientId = process.env.EXPO_PUBLIC_APPLE_CLIENT_ID;

    if (!appleClientId && Platform.OS !== "ios") {
      Alert.alert(
        "Apple Sign-In",
        "Apple Sign-In is not configured yet. Please configure EXPO_PUBLIC_APPLE_CLIENT_ID in your environment to enable Apple authentication."
      );
      return;
    }

    try {
      setLoading(true);
      Alert.alert(
        "Apple Sign-In",
        "Apple Sign-In requires Apple Developer credentials to be configured in your environment."
      );
    } catch (e: any) {
      console.log("Apple Sign-In Error:", e);
      const errMsg = getFriendlyAuthErrorMessage(e);
      Alert.alert("Apple Sign-In Failed", errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleNoAccount = () => {
    router.push("/signup");
  };

  return (
    <AmbientBackground style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Brand Section */}
          <View style={styles.brandContainer}>
            <LinearGradient
              colors={["#ff80ab", "#e91e63"]}
              style={styles.logoBadge}
            >
              <Ionicons name="shield-checkmark" size={38} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.title}>Naari Kavach</Text>
            <Text style={styles.subtitle}>
              Women Safety & Menstrual Wellness Hub
            </Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Welcome Back</Text>
              <Text style={styles.cardSubText}>
                Log in to sync your safety alerts & cycle insights
              </Text>
            </View>

            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#8e24aa"
                  style={styles.inputIcon}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#a090b0"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#8e24aa"
                  style={styles.inputIcon}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#a090b0"
                  secureTextEntry
                  style={styles.input}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleForgotPassword}
              activeOpacity={0.7}
              style={styles.forgotPassContainer}
            >
              <Text style={styles.forgotPassword}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Submit Button */}
            <TouchableOpacity
              onPress={handleLogin}
              activeOpacity={0.85}
              style={styles.buttonWrapper}
              disabled={loading}
            >
              <LinearGradient
                colors={["#ab47bc", "#8e24aa", "#6a1b9a"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Sign In</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={20}
                      color="#fff"
                      style={{ marginLeft: 6 }}
                    />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Authentication Buttons */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              activeOpacity={0.8}
              style={styles.socialButton}
              disabled={loading}
            >
              <Ionicons name="logo-google" size={20} color="#EA4335" style={{ marginRight: 10 }} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAppleSignIn}
              activeOpacity={0.8}
              style={[styles.socialButton, styles.appleButton]}
              disabled={loading}
            >
              <Ionicons name="logo-apple" size={20} color="#000000" style={{ marginRight: 10 }} />
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            </TouchableOpacity>

            {/* Footer Sign Up Link */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={handleNoAccount} activeOpacity={0.7}>
                <Text style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 40,
    justifyContent: "center",
    flexGrow: 1,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoBadge: {
    width: 74,
    height: 74,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#ff80ab",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: "#1C0D2B",
    textAlign: "center",
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    color: "#6E5A80",
    marginTop: 4,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: "rgba(142, 36, 170, 0.08)",
    shadowColor: "#0F031D",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    ...(Platform.OS === "web" && {
      boxShadow: "0px 6px 20px rgba(15, 3, 29, 0.06)",
    }),
  },
  cardHeader: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1C0D2B",
    marginBottom: 4,
  },
  cardSubText: {
    fontSize: 13,
    color: "#6b5b7b",
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4a148c",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f7f2fa",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(142, 36, 170, 0.2)",
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 14 : 11,
    fontSize: 15,
    color: "#2a0845",
    fontWeight: "500",
  },
  forgotPassContainer: {
    alignSelf: "flex-end",
    marginBottom: 20,
    marginTop: -4,
  },
  forgotPassword: {
    color: "#8e24aa",
    fontSize: 13,
    fontWeight: "700",
  },
  buttonWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#8e24aa",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  button: {
    flexDirection: "row",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e0d0e8",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: "600",
    color: "#9c88b0",
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "#e0d0e8",
    marginBottom: 12,
    shadowColor: "#0F031D",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  appleButton: {
    borderColor: "#d0c0d8",
    marginBottom: 18,
  },
  socialButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2a0845",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  footerText: {
    fontSize: 14,
    color: "#6b5b7b",
  },
  footerLink: {
    fontSize: 14,
    color: "#8e24aa",
    fontWeight: "800",
  },
});
