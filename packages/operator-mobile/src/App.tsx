import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { store } from './store';
import AppNavigator from './navigation/AppNavigator';
import { NotificationProvider } from './components/NotificationProvider';
import { SocketProvider } from './context/SocketContext';
import { useAuth } from './hooks/useAuth';
import { Login } from './features/Login';
import { registerRootComponent } from 'expo';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function App() {
  const { user, isAuthenticated, login, loadUser } = useAuth();
  const [socket, setSocket] = useState<any>(null);
  
  // Initialize notifications
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        console.log('[Notifications] Push token:', token);
      }
    });
    
    // Handle incoming notifications
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notifications] Received:', notification);
    });
    
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.jobId) {
        // Navigate to job detail
        Linking.openURL(`printloop-operator://job/${data.jobId}`);
      }
    });
    
    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);
  
  // Initialize socket connection
  useEffect(() => {
    if (isAuthenticated) {
      const { io } = require('socket.io-client');
      const newSocket = io('http://localhost:3456', {
        path: '/socket.io',
        auth: {
          tenantId: user?.tenantId,
          role: 'mobile',
        },
        transports: ['websocket', 'polling'],
      });
      
      newSocket.on('connect', () => {
        console.log('[Socket] Mobile connected');
      });
      
      newSocket.on('disconnect', (reason: string) => {
        console.log('[Socket] Mobile disconnected:', reason);
      });
      
      newSocket.on('job:new', (data: any) => {
        // Trigger local notification
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'New Print Job',
            body: `Job ${data.code} - ${data.pages} pages - ${data.amount}`,
            data: { jobId: data.id, action: 'accept' },
            categoryIdentifier: 'PRINT_JOB_ACTIONS',
          },
          trigger: null, // immediate
        });
      });
      
      setSocket(socket);
    }
    
    return () => {
      socket?.disconnect();
    };
  }, [isAuthenticated, user]);
  
  return (
    <Provider store={store}>
      <SocketProvider socket={socket}>
        <NotificationProvider>
          <NavigationContainer linking={{ prefixes: ['printloop-operator://'] }}>
            {isAuthenticated ? <AppNavigator /> : <Login onLogin={login} />}
          </NavigationContainer>
        </NotificationProvider>
      </SocketProvider>
    </Provider>
  );
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  
  if (!Device.isDevice) {
    console.log('Must use physical device for push notifications');
    return null;
  }
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return null;
  }
  
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

registerRootComponent(App);