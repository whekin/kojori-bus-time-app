import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, MaxContentWidth } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { MapFocusProvider } from '@/hooks/use-map-focus';
import { TabNavProvider, type TabRoute } from '@/hooks/use-tab-nav';

type AppTabsProps = {
  backEnabled?: boolean;
  deferInactiveTabs?: boolean;
  onRequestDirectionPicker?: () => void;
};

type WebTab = {
  route: TabRoute;
  href: '/' | '/explore' | '/timetable' | '/settings';
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

function hrefForRoute(route: TabRoute): WebTab['href'] {
  if (route === 'index') return '/';
  return `/${route}`;
}

export default function AppTabs(_props: AppTabsProps) {
  const router = useRouter();
  const { t } = useI18n();
  const tabs: WebTab[] = [
    { route: 'index', href: '/', title: t('tabsDepartures'), icon: 'bus-clock' },
    { route: 'explore', href: '/explore', title: t('tabsMap'), icon: 'map-marker-radius' },
    { route: 'timetable', href: '/timetable', title: t('tabsTimetable'), icon: 'table-clock' },
    { route: 'settings', href: '/settings', title: t('tabsSettings'), icon: 'cog' },
  ];

  function navigateToTab(route: TabRoute) {
    router.push(hrefForRoute(route));
  }

  return (
    <MapFocusProvider>
      <TabNavProvider value={navigateToTab}>
        <Tabs>
          <TabSlot style={styles.slot} />
          <TabList asChild>
            <CustomTabList>
              {tabs.map(tab => (
                <TabTrigger key={tab.route} name={tab.route} href={tab.href} asChild>
                  <TabButton icon={tab.icon}>{tab.title}</TabButton>
                </TabTrigger>
              ))}
            </CustomTabList>
          </TabList>
        </Tabs>
      </TabNavProvider>
    </MapFocusProvider>
  );
}

export function TabButton({ children, icon, isFocused, ...props }: TabTriggerSlotProps & { icon: WebTab['icon'] }) {
  const C = useAppColors();
  const tint = isFocused ? C.text : C.textDim;

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [
        styles.tabButton,
        {
          backgroundColor: isFocused ? C.surface : 'transparent',
          borderColor: isFocused ? C.surfaceHigh : 'transparent',
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <MaterialCommunityIcons name={icon} size={18} color={isFocused ? C.primary : C.textDim} />
      <Text style={[styles.tabButtonLabel, { color: tint }]}>{children}</Text>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const C = useAppColors();

  return (
    <View {...props} style={styles.tabListContainer}>
      <View
        style={[
          styles.innerContainer,
          {
            backgroundColor: alpha(C.panel, 'F2'),
            borderColor: C.border,
          },
        ]}>
        <View style={styles.brandBlock}>
          <Text style={[styles.brandText, { color: C.text }]}>Kojoring Time</Text>
          <Text style={[styles.brandSubtext, { color: C.textDim }]}>Kojori · Tbilisi</Text>
        </View>

        <View style={styles.tabButtons}>{props.children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: '100%',
  },
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    minHeight: 58,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  brandBlock: {
    minWidth: 136,
    marginRight: 'auto',
  },
  brandText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandSubtext: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tabButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  tabButton: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabButtonLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
  },
});
