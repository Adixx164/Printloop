import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { LucideIcons } from '@/components/LucideIcons';
import { Dashboard } from '@/features/Dashboard';
import { Queue } from '@/features/Queue';
import { Payouts } from '@/features/Payouts';
import { Analytics } from '@/features/Analytics';
import { Settings } from '@/features/Settings';
import { JobDetail } from '@/features/JobDetail';
import { ReactNode } from 'react';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;
          switch (route.name) {
            case 'Dashboard': iconName = 'layout-dashboard'; break;
            case 'Queue': iconName = 'printer'; break;
            case 'Payouts': iconName = 'banknote'; break;
            case 'Analytics': iconName = 'bar-chart-2'; break;
            case 'Settings': iconName = 'settings'; break;
            default: iconName = 'circle';
          }
          return <LucideIcons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#D14B2C',
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          backgroundColor: '#F8F4ED',
          borderTopWidth: 2,
          borderTopColor: '#1A1410',
          height: 70,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Queue" component={QueueStack} />
      <Tab.Screen name="Payouts" component={PayoutsStack} />
      <Tab.Screen name="Analytics" component={AnalyticsStack} />
      <Tab.Screen name="Settings" component={SettingsStack} />
    </Tab.Navigator>
  );
}

function DashboardStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Dashboard" component={Dashboard} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function QueueStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Queue" component={Queue} options={{ headerShown: false }} />
      <Stack.Screen name="JobDetail" component={JobDetail} options={{ title: 'Job Details' }} />
    </Stack.Navigator>
  );
}

function PayoutsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Payouts" component={Payouts} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function AnalyticsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Analytics" component={Analytics} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Settings" component={Settings} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

export const AppNavigator = () => <MainTabs />;