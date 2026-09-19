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
import { AuthService, getFriendlyAuthErrorMessage } from "@/services/AuthService";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isSent, setIsSent] = useState<boolean>(false);

  const validateEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

  const handleRequestReset = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert("Missing Email", "Please enter your registered email address.");
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address format.");
      return;
    }

    try {
      setLoading(true);
      await AuthService.forgotPassword(trimmedEmail);
      setIsSent(true);
    } catch (e: any) {
      console.log("Forgot password request error:", e);
      const friendlyMsg = getFriendlyAuthErrorMessage(e);
      Alert.alert("Request Failed", friendlyMsg);
    } finally {
      setLoading(false);
    }
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
              colors={["#ab47bc", "#8e24aa"]}
              style={styles.logoBadge}
            >
              <Ionicons name="key" size={36} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.title}>Password Recovery</Text>
            <Text style={styles.subtitle}>
              Reset your Naari Kavach account password
            </Text>
          </View>

          {/* Recovery Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {isSent ? "Check Your Inbox" : "Forgot Password"}
              </Text>
              <Text style={styles.cardSubText}>
                {isSent
                  ? `We've sent password reset instructions to ${email}. Please check your inbox and spam folder.`
                  : "Enter the email address associated with your account and we'll send you a password reset link."}
              </Text>
            </View>

            {isSent ? (
              <View style={styles.successContainer}>
                <View style={styles.successIconBadge}>
                  <Ionicons name="mail-unread" size={32} color="#8e24aa" />
                </View>
                <Text style={styles.successText}>
                  Follow the link inside the email to securely choose a new password. Once updated, you can log in with your new credentials.
                </Text>

                <TouchableOpacity
                  onPress={() => router.replace("/login")}
                  activeOpacity={0.85}
                  style={styles.buttonWrapper}
                >
                  <LinearGradient
                    colors={["#ab47bc", "#8e24aa", "#6a1b9a"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    <Text style={styles.buttonText}>Return to Log In</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#fff"
                      style={{ marginLeft: 8 }}
                    />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setIsSent(false)}
                  style={styles.resendBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendText}>Send to a different email</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
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

                {/* Request Reset Button */}
                <TouchableOpacity
                  onPress={handleRequestReset}
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
                        <Text style={styles.buttonText}>Send Reset Email</Text>
                        <Ionicons
                          name="paper-plane"
                          size={18}
                          color="#fff"
                          style={{ marginLeft: 8 }}
                        />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                </View>

                {/* Back to Login Link */}
                <View style={styles.footerRow}>
                  <TouchableOpacity
                    onPress={() => router.replace("/login")}
                    activeOpacity={0.7}
                    style={styles.backToLoginBtn}
                  >
                    <Ionicons name="arrow-back" size={16} color="#8e24aa" />
                    <Text style={styles.footerLink}> Back to Log In</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
    marginBottom: 24,
  },
  logoBadge: {
    width: 70,
    height: 70,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#ab47bc",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: "#1C0D2B",
    textAlign: "center",
    letterSpacing: 0.6,
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
    paddingVertical: 26,
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
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 22,
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
    marginBottom: 15,
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
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    fontSize: 15,
    color: "#2a0845",
    fontWeight: "500",
  },
  buttonWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
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
    marginVertical: 18,
  },
  dividerLine: {
    height: 1,
    backgroundColor: "#e0d0e8",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  backToLoginBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerLink: {
    fontSize: 14,
    color: "#8e24aa",
    fontWeight: "800",
    marginLeft: 4,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  successIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f3e5f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successText: {
    fontSize: 14,
    color: "#4a148c",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  resendBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8e24aa",
  },
});
