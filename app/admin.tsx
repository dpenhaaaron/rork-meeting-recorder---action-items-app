import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Users, Mail, MapPin, Calendar, ArrowLeft, Trash2, Activity, MessageSquare, Globe, CheckCircle, Target, Zap } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  location: string;
  createdAt: string;
}

interface AdminMetrics {
  totalUsers: number;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  totalConversations: number;
  totalTranslations: number;
  totalDecisions: number;
  totalActions: number;
  totalDownloads: {
    total: number;
    ios: number;
    android: number;
    web: number;
  };
}

export default function AdminScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalUsers: 0,
    activeUsers: { daily: 0, weekly: 0, monthly: 0 },
    totalConversations: 0,
    totalTranslations: 0,
    totalDecisions: 0,
    totalActions: 0,
    totalDownloads: { total: 0, ios: 0, android: 0, web: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadUsers = async () => {
    try {
      // In a real app, this would fetch from an API
      // For now, we'll simulate with stored data
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith('user_'));
      const userData = await AsyncStorage.multiGet(userKeys);
      
      const loadedUsers: AdminUser[] = userData
        .map(([key, value]) => {
          if (value) {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }
          return null;
        })
        .filter(Boolean);

      // Add some mock users for demonstration
      const mockUsers: AdminUser[] = [
        {
          id: '1',
          email: 'john.doe@example.com',
          fullName: 'John Doe',
          location: 'New York, NY',
          createdAt: '2024-01-15T10:30:00Z',
        },
        {
          id: '2',
          email: 'jane.smith@example.com',
          fullName: 'Jane Smith',
          location: 'Los Angeles, CA',
          createdAt: '2024-01-20T14:45:00Z',
        },
        {
          id: '3',
          email: 'mike.johnson@example.com',
          fullName: 'Mike Johnson',
          location: 'Chicago, IL',
          createdAt: '2024-02-01T09:15:00Z',
        },
      ];

      const allUsers = [...loadedUsers, ...mockUsers];
      setUsers(allUsers);
      
      // Generate mock metrics based on user data
      const totalUsers = allUsers.length;
      const mockMetrics: AdminMetrics = {
        totalUsers,
        activeUsers: {
          daily: Math.floor(totalUsers * 0.3),
          weekly: Math.floor(totalUsers * 0.6),
          monthly: Math.floor(totalUsers * 0.8),
        },
        totalConversations: Math.floor(totalUsers * 15.2), // ~15 conversations per user
        totalTranslations: Math.floor(totalUsers * 8.7), // ~9 translations per user
        totalDecisions: Math.floor(totalUsers * 12.3), // ~12 decisions per user
        totalActions: Math.floor(totalUsers * 18.9), // ~19 actions per user
        totalDownloads: {
          total: Math.floor(totalUsers * 1.8), // Some users download multiple times
          ios: Math.floor(totalUsers * 0.7),
          android: Math.floor(totalUsers * 0.8),
          web: Math.floor(totalUsers * 0.3),
        },
      };
      
      setMetrics(mockMetrics);
    } catch (error) {
      console.error('Failed to load users:', error);
      Alert.alert('Error', 'Failed to load user data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteUser = (userId: string) => {
    Alert.alert(
      'Delete User',
      'Are you sure you want to delete this user? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(`user_${userId}`);
              setUsers(prev => prev.filter(user => user.id !== userId));
              Alert.alert('Success', 'User deleted successfully');
            } catch (error) {
              console.error('Failed to delete user:', error);
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers();
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.title}>Admin Dashboard</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.metricsContainer}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsContent}
        >
          <View style={styles.metricCard}>
            <Users size={24} color="#3B82F6" />
            <Text style={styles.metricNumber}>{metrics.totalUsers}</Text>
            <Text style={styles.metricLabel}>Total Users</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Activity size={24} color="#10B981" />
            <Text style={styles.metricNumber}>{metrics.activeUsers.daily}</Text>
            <Text style={styles.metricLabel}>Daily Active</Text>
          </View>
          
          <View style={styles.metricCard}>
            <MessageSquare size={24} color="#F59E0B" />
            <Text style={styles.metricNumber}>{metrics.totalConversations}</Text>
            <Text style={styles.metricLabel}>Conversations</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Globe size={24} color="#8B5CF6" />
            <Text style={styles.metricNumber}>{metrics.totalTranslations}</Text>
            <Text style={styles.metricLabel}>Translations</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Target size={24} color="#EF4444" />
            <Text style={styles.metricNumber}>{metrics.totalDecisions}</Text>
            <Text style={styles.metricLabel}>Decisions</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Zap size={24} color="#06B6D4" />
            <Text style={styles.metricNumber}>{metrics.totalActions}</Text>
            <Text style={styles.metricLabel}>Actions</Text>
          </View>
        </ScrollView>
        
        <View style={styles.additionalMetrics}>
          <Text style={styles.sectionTitle}>App Downloads</Text>
          <View style={styles.downloadStats}>
            <View style={styles.downloadStat}>
              <Text style={styles.downloadNumber}>{metrics.totalDownloads.total}</Text>
              <Text style={styles.downloadLabel}>Total</Text>
            </View>
            <View style={styles.downloadStat}>
              <Text style={styles.downloadNumber}>{metrics.totalDownloads.ios}</Text>
              <Text style={styles.downloadLabel}>iOS</Text>
            </View>
            <View style={styles.downloadStat}>
              <Text style={styles.downloadNumber}>{metrics.totalDownloads.android}</Text>
              <Text style={styles.downloadLabel}>Android</Text>
            </View>
            <View style={styles.downloadStat}>
              <Text style={styles.downloadNumber}>{metrics.totalDownloads.web}</Text>
              <Text style={styles.downloadLabel}>Web</Text>
            </View>
          </View>
          
          <Text style={styles.sectionTitle}>Active Users</Text>
          <View style={styles.activeUserStats}>
            <View style={styles.activeUserStat}>
              <Text style={styles.activeUserNumber}>{metrics.activeUsers.daily}</Text>
              <Text style={styles.activeUserLabel}>Daily</Text>
            </View>
            <View style={styles.activeUserStat}>
              <Text style={styles.activeUserNumber}>{metrics.activeUsers.weekly}</Text>
              <Text style={styles.activeUserLabel}>Weekly</Text>
            </View>
            <View style={styles.activeUserStat}>
              <Text style={styles.activeUserNumber}>{metrics.activeUsers.monthly}</Text>
              <Text style={styles.activeUserLabel}>Monthly</Text>
            </View>
          </View>
        </View>

        <ScrollView 
          style={styles.usersList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <Text style={styles.sectionTitle}>Registered Users</Text>
          
          {users.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userInfo}>
                <View style={styles.userHeader}>
                  <Text style={styles.userName}>{user.fullName}</Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteUser(user.id)}
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.userDetail}>
                  <Mail size={16} color="#6B7280" />
                  <Text style={styles.userDetailText}>{user.email}</Text>
                </View>
                
                <View style={styles.userDetail}>
                  <MapPin size={16} color="#6B7280" />
                  <Text style={styles.userDetailText}>{user.location}</Text>
                </View>
                
                <View style={styles.userDetail}>
                  <Calendar size={16} color="#6B7280" />
                  <Text style={styles.userDetailText}>
                    Joined {formatDate(user.createdAt)}
                  </Text>
                </View>
              </View>
            </View>
          ))}

          {users.length === 0 && !isLoading && (
            <View style={styles.emptyState}>
              <Users size={48} color="#9CA3AF" />
              <Text style={styles.emptyStateText}>No users found</Text>
              <Text style={styles.emptyStateSubtext}>
                Users will appear here once they sign up
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  placeholder: {
    width: 40,
  },
  metricsContainer: {
    paddingVertical: 16,
  },
  metricsContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  additionalMetrics: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  downloadStats: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  downloadStat: {
    flex: 1,
    alignItems: 'center',
  },
  downloadNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  downloadLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  activeUserStats: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  activeUserStat: {
    flex: 1,
    alignItems: 'center',
  },
  activeUserNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  activeUserLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  usersList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  userDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userDetailText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
});