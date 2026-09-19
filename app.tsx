// app.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// ✅ screens live inside the app/ folder
import LoginScreen from "./app/login";
import SignupScreen from "./app/signup";
import HomeScreen from "./app/(tabs)/home";
import MenstrualScreen from "./app/(tabs)/menstrual";
import SafetyScreen from "./app/(tabs)/safety";
import FitMindScreen from "./app/(tabs)/fitmind";

export type RootStackParamList = {
  login: undefined;
  signup: undefined;
  home: undefined;
  menstrual: undefined;
  safety: undefined;
  fitmind: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="login"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="login" component={LoginScreen} />
        <Stack.Screen name="signup" component={SignupScreen} />
        <Stack.Screen name="home" component={HomeScreen} />
        <Stack.Screen name="menstrual" component={MenstrualScreen} />
        <Stack.Screen name="safety" component={SafetyScreen} />
        <Stack.Screen name="fitmind" component={FitMindScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
