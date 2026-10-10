# NAARI KAVACH — wearable and Android integration

## Formal Verification and Mathematical Proofs

The entire formal proof dossier is in [**Formal Verification and Mathematical Proofs**](formal-verification-and-mathematical-proofs/README.md), including [**all 24 numbered Z3 properties in GitHub-native LaTeX**](formal-verification-and-mathematical-proofs/EXACT_THEOREMS.md), [**SOS mathematical induction**](formal-verification-and-mathematical-proofs/SOS_COUNTER_INDUCTION.md), and [**reproducible proof toolchain**](formal-verification-and-mathematical-proofs/PROOF_SCOPE_AND_REPRODUCTION.md).

**Scope:** these are abstract safety-model checks with regression/compile evidence, **not** a full hardware–software proof. The recurring dual-sensor I²C failures require a physical fault-isolation and acceptance run.

---

## Expo application setup

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
