import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Plus, BookOpen, Clock, X } from 'lucide-react-native';
import { Note, Bookmark } from '@/types/meeting';

interface RecordingNotesProps {
  duration: number;
  notes: Note[];
  bookmarks: Bookmark[];
  onAddNote: (text: string, timestamp: number) => void;
  onAddBookmark: (title: string, description: string, timestamp: number) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
}

export default function RecordingNotes({
  duration,
  notes,
  bookmarks,
  onAddNote,
  onAddBookmark,
  onDeleteNote,
  onDeleteBookmark,
}: RecordingNotesProps) {
  const [noteText, setNoteText] = useState('');
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkDescription, setBookmarkDescription] = useState('');
  const [showBookmarkForm, setShowBookmarkForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'notes' | 'bookmarks'>('notes');

  const formatTimestamp = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const handleAddNote = useCallback(() => {
    if (noteText.trim()) {
      onAddNote(noteText.trim(), duration);
      setNoteText('');
    }
  }, [noteText, duration, onAddNote]);

  const handleAddBookmark = useCallback(() => {
    if (bookmarkTitle.trim()) {
      onAddBookmark(bookmarkTitle.trim(), bookmarkDescription.trim(), duration);
      setBookmarkTitle('');
      setBookmarkDescription('');
      setShowBookmarkForm(false);
    }
  }, [bookmarkTitle, bookmarkDescription, duration, onAddBookmark]);

  const handleDeleteNote = useCallback((noteId: string) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteNote(noteId) },
      ]
    );
  }, [onDeleteNote]);

  const handleDeleteBookmark = useCallback((bookmarkId: string) => {
    Alert.alert(
      'Delete Bookmark',
      'Are you sure you want to delete this bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteBookmark(bookmarkId) },
      ]
    );
  }, [onDeleteBookmark]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recording Notes</Text>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'notes' && styles.activeTab]}
            onPress={() => setActiveTab('notes')}
          >
            <Text style={[styles.tabText, activeTab === 'notes' && styles.activeTabText]}>Notes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'bookmarks' && styles.activeTab]}
            onPress={() => setActiveTab('bookmarks')}
          >
            <Text style={[styles.tabText, activeTab === 'bookmarks' && styles.activeTabText]}>Bookmarks</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'notes' ? (
        <View style={styles.content}>
          <View style={styles.inputSection}>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Add a note at current time..."
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.addButton, !noteText.trim() && styles.disabledButton]}
              onPress={handleAddNote}
              disabled={!noteText.trim()}
            >
              <Plus size={16} color={noteText.trim() ? '#FFFFFF' : '#9CA3AF'} />
              <Text style={[styles.addButtonText, !noteText.trim() && styles.disabledButtonText]}>
                Add Note
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.notesList} showsVerticalScrollIndicator={false}>
            {notes.length === 0 ? (
              <View style={styles.emptyState}>
                <BookOpen size={32} color="#D1D5DB" />
                <Text style={styles.emptyStateText}>No notes yet</Text>
                <Text style={styles.emptyStateSubtext}>Add notes during recording to capture key moments</Text>
              </View>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={styles.noteItem}>
                  <View style={styles.noteHeader}>
                    <View style={styles.timestampBadge}>
                      <Clock size={12} color="#FF8C00" />
                      <Text style={styles.timestampText}>{formatTimestamp(note.timestamp)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteNote(note.id)}
                    >
                      <X size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.noteText}>{note.text}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.content}>
          {!showBookmarkForm ? (
            <TouchableOpacity
              style={styles.addBookmarkButton}
              onPress={() => setShowBookmarkForm(true)}
            >
              <Plus size={16} color="#FF8C00" />
              <Text style={styles.addBookmarkButtonText}>Add Bookmark</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.bookmarkForm}>
              <TextInput
                style={styles.bookmarkTitleInput}
                value={bookmarkTitle}
                onChangeText={setBookmarkTitle}
                placeholder="Bookmark title (e.g., Key Point, Prayer Request)"
                placeholderTextColor="#9CA3AF"
                maxLength={100}
              />
              <TextInput
                style={styles.bookmarkDescriptionInput}
                value={bookmarkDescription}
                onChangeText={setBookmarkDescription}
                placeholder="Optional description..."
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={300}
              />
              <View style={styles.bookmarkActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowBookmarkForm(false);
                    setBookmarkTitle('');
                    setBookmarkDescription('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, !bookmarkTitle.trim() && styles.disabledButton]}
                  onPress={handleAddBookmark}
                  disabled={!bookmarkTitle.trim()}
                >
                  <Text style={[styles.saveButtonText, !bookmarkTitle.trim() && styles.disabledButtonText]}>
                    Save Bookmark
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView style={styles.bookmarksList} showsVerticalScrollIndicator={false}>
            {bookmarks.length === 0 ? (
              <View style={styles.emptyState}>
                <BookOpen size={32} color="#D1D5DB" />
                <Text style={styles.emptyStateText}>No bookmarks yet</Text>
                <Text style={styles.emptyStateSubtext}>Mark important moments for easy reference</Text>
              </View>
            ) : (
              bookmarks.map((bookmark) => (
                <View key={bookmark.id} style={styles.bookmarkItem}>
                  <View style={styles.bookmarkHeader}>
                    <View style={styles.timestampBadge}>
                      <Clock size={12} color="#FF8C00" />
                      <Text style={styles.timestampText}>{formatTimestamp(bookmark.timestamp)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteBookmark(bookmark.id)}
                    >
                      <X size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.bookmarkTitle}>{bookmark.title}</Text>
                  {bookmark.description && (
                    <Text style={styles.bookmarkDescription}>{bookmark.description}</Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 400,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#FF8C00',
  },
  content: {
    flex: 1,
  },
  inputSection: {
    marginBottom: 16,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C00',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    alignSelf: 'flex-start',
  },
  disabledButton: {
    backgroundColor: '#F3F4F6',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  disabledButtonText: {
    color: '#9CA3AF',
  },
  notesList: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 8,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
  },
  noteItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF8C00',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timestampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  timestampText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF8C00',
  },
  deleteButton: {
    padding: 4,
  },
  noteText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  addBookmarkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF8C00',
    borderStyle: 'dashed',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  addBookmarkButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FF8C00',
  },
  bookmarkForm: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bookmarkTitleInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  bookmarkDescriptionInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  bookmarkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  bookmarksList: {
    flex: 1,
  },
  bookmarkItem: {
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  bookmarkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bookmarkTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  bookmarkDescription: {
    fontSize: 12,
    color: '#A16207',
    lineHeight: 16,
  },
});