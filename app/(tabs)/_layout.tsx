// app/(tabs)/_layout.tsx
import React, { useEffect } from "react";
import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthService } from "@/services/AuthService";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const loggedIn = await AuthService.isLoggedIn();
      if (!loggedIn && isMounted) {
        router.replace("/login");
      }
    };
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#8e24aa",
        tabBarInactiveTintColor: "#a090b0",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "rgba(142, 36, 170, 0.08)",
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
          elevation: 4,
          shadowColor: "#0F031D",
          shadowOpacity: 0.04,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: "Safety",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="menstrual"
        options={{
          title: "Menstrual",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="female" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="fitmind"
        options={{
          title: "FitMind",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="leaf" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: "Assistant",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

