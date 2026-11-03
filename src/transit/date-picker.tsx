import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { dateLocale } from "@/components/timetable-rows";
import { alpha, type AppColors } from "@/constants/theme";
import { useAppColors } from "@/hooks/use-app-colors";
import { useI18n } from "@/hooks/use-i18n";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { createThemedStyles } from "@/utils/themed-styles";
import { useTransitCopy } from "./copy";

const MONO = Platform.select({
  android: "monospace",
  ios: "Menlo",
  default: "monospace",
});

/** Month calendar in the timetable's card style. Dates are `YYYY-MM-DD`. */
export function TransitDatePicker({
  value,
  today,
  accentColor,
  onSelect,
  onClose,
}: {
  value: string;
  /** Marked with a ring so the rider keeps their bearings. */
  today?: string;
  accentColor?: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const colors = useAppColors();
  const styles = getStyles(colors);
  const accent = accentColor ?? colors.primary;
  const reducedMotion = useReducedMotion();
  const copy = useTransitCopy();
  const { resolvedLanguage } = useI18n();
  const [month, setMonth] = useState(value.slice(0, 7));
  const locale = dateLocale(resolvedLanguage);
  const [year, number] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, number - 1, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = Array.from(
    { length: Math.ceil((offset + days) / 7) * 7 },
    (_, i) => i - offset + 1,
  );
  function changeMonth(delta: number) {
    setMonth(
      new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7),
    );
  }
  function monthButton(delta: number) {
    const disabled =
      delta < 0 ? year <= 2000 && number === 1 : year >= 2100 && number === 12;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy(delta < 0 ? "previousMonth" : "nextMonth")}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={6}
        onPress={() => changeMonth(delta)}
        style={({ pressed }) => [
          styles.monthButton,
          pressed && { backgroundColor: colors.surfaceHigh },
          disabled && { opacity: 0.4 },
        ]}
      >
        <MaterialCommunityIcons
          name={delta < 0 ? "chevron-left" : "chevron-right"}
          size={20}
          color={colors.textDim}
        />
      </Pressable>
    );
  }
  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <Pressable
        accessible={false}
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: alpha(colors.bg, "D9") }]}
      >
        {/* Swallow taps inside the card so they don't close the picker. */}
        <Pressable accessible={false} style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            {monthButton(-1)}
            <Text style={styles.monthTitle}>
              {firstDay.toLocaleDateString(locale, {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </Text>
            {monthButton(1)}
          </View>
          <View style={styles.weekRow}>
            {Array.from({ length: 7 }, (_, i) => (
              <Text key={i} style={styles.weekday}>
                {new Date(Date.UTC(2026, 0, 5 + i))
                  .toLocaleDateString(locale, {
                    weekday: "short",
                    timeZone: "UTC",
                  })
                  .toUpperCase()}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, index) => {
              const valid = day >= 1 && day <= days;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const selected = valid && value === date;
              const isToday = valid && today === date;
              return (
                <View key={index} style={styles.cell}>
                  {valid ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={new Date(
                        `${date}T12:00:00Z`,
                      ).toLocaleDateString(locale, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                      onPress={() => onSelect(date)}
                      style={({ pressed }) => [
                        styles.day,
                        isToday && { borderColor: alpha(accent, "80") },
                        selected && {
                          borderColor: accent,
                          backgroundColor: alpha(accent, "22"),
                        },
                        pressed && !selected && {
                          backgroundColor: colors.surfaceHigh,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          (selected || isToday) && {
                            color: accent,
                            fontWeight: "700",
                          },
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              pressed && { backgroundColor: colors.surfaceHigh },
            ]}
          >
            <Text style={styles.cancelText}>{copy("cancel")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const getStyles = createThemedStyles((C: AppColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "center", padding: 20 },
    card: {
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
      padding: 16,
      gap: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 8 },
    monthButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
    },
    monthTitle: {
      flex: 1,
      textAlign: "center",
      color: C.text,
      fontSize: 17,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    weekRow: { flexDirection: "row", paddingTop: 4 },
    weekday: {
      width: `${100 / 7}%`,
      textAlign: "center",
      color: C.textFaint,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
    },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: {
      width: `${100 / 7}%`,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    day: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "transparent",
    },
    dayText: { color: C.text, fontSize: 15, fontFamily: MONO },
    cancel: {
      alignSelf: "flex-end",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 100,
      borderWidth: 1,
      borderColor: C.border,
    },
    cancelText: { color: C.textDim, fontSize: 13, fontWeight: "500" },
  }),
);
