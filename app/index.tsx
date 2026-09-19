import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { AuthService } from "@/services/AuthService";
import { AmbientBackground } from "@/components/ui/AmbientBackground";

export default function Index() {
  const [checking, setChecking] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const performAutoLogin = async () => {
      try {
        const user = await AuthService.checkAutoLogin();
        if (isMounted) {
          if (user) {
            router.replace("/(tabs)/home");
          } else {
            router.replace("/login");
          }
        }
      } catch (error) {
        console.warn("Auto-login check error:", error);
        if (isMounted) {
          router.replace("/login");
        }
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    };

    performAutoLogin();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AmbientBackground style={styles.container}>
      <ActivityIndicator size="large" color="#8e24aa" />
    </AmbientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});