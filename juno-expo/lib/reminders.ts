import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * Streak reminders — local notifications, no push server.
 *
 * After each clock-in Juno schedules one reminder for tomorrow morning, and on
 * opening the app without having clocked in it schedules one for this evening,
 * before the streak would lapse at midnight. Both are replaced, never stacked:
 * the identifiers are fixed, so a reminder is a single standing promise rather
 * than a pile of nags.
 */

const MORNING = "juno.clockin.morning";
const EVENING = "juno.clockin.evening";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channelReady = false;
async function ensureChannel() {
  if (Platform.OS !== "android" || channelReady) return;
  await Notifications.setNotificationChannelAsync("streak", {
    name: "Clock-in streak",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#D6FF3D",
  });
  channelReady = true;
}

/** Ask once, when the person has just done the thing a reminder would be for. */
export async function enableReminders(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    // Android 13+ only shows the POST_NOTIFICATIONS prompt once a channel exists.
    await ensureChannel();
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

async function scheduleAt(id: string, date: Date, title: string, body: string) {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  if (date.getTime() <= Date.now()) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, data: { url: "juno:///social" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: "streak" },
  });
}

/** Just clocked in: remind tomorrow at 9:00, and drop tonight's warning. */
export async function afterClockIn(streak: number, nextReward: number) {
  if (Platform.OS === "web") return;
  try {
    const granted = (await Notifications.getPermissionsAsync()).granted;
    if (!granted) return;
    await Notifications.cancelScheduledNotificationAsync(EVENING).catch(() => undefined);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await scheduleAt(
      MORNING,
      tomorrow,
      `Day ${streak + 1} is open`,
      `Clock in on Juno for +${nextReward} SKR and keep your ${streak}-day streak.`,
    );
  } catch {
    // A reminder is a courtesy; failing to schedule one must never fail a clock-in.
  }
}

/** Opened without clocking in today: warn at 20:00 that the streak ends at midnight. */
export async function streakAtRisk(streak: number) {
  if (Platform.OS === "web" || streak < 1) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const tonight = new Date();
    tonight.setHours(20, 0, 0, 0);
    await scheduleAt(
      EVENING,
      tonight,
      `Your ${streak}-day streak ends at midnight`,
      "One tap on Juno keeps it alive.",
    );
  } catch {
    // See above.
  }
}
