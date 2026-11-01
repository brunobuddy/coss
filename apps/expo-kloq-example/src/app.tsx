import { KloqCalendar } from "expo-kloq";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ACCOUNTS, CALENDARS, seedEvents } from "./seed";

export function App() {
  // seeded relative to today, so "Today" always lands on events
  const [events] = useState(() => seedEvents());
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <KloqCalendar
        accounts={ACCOUNTS}
        calendars={CALENDARS}
        initialEvents={events}
        initialView="week"
        timeZones={["America/New_York"]}
      />
    </SafeAreaProvider>
  );
}
