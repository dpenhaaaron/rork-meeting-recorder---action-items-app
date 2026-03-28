import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Edit3, Save, Users, Plus, X, Check } from 'lucide-react-native';

interface Note {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  type: 'note' | 'action' | 'decision' | 'question';
}

interface CollaborativeNotesProps {
  isRecording: boolean;
  currentUser?: string;
  onNoteAdd?: (note: Omit<Note, 'id' | 'timestamp'>) => void;
  onNoteUpdate?: (noteId: string, text: string) => void;
  onNoteDelete?: (noteId: string) => void;
}

export default function CollaborativeNotes({
  isRecording,
  currentUser = 'You',
  onNoteAdd,
  onNoteUpdate,
  onNoteDelete,
}: CollaborativeNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteType, setNewNoteType] = useState<Note['type']>('note');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const noteTypes = [
    { type: 'note' as const, label: 'Note', color: '#6B7280', emoji: '📝' },
    { type: 'action' as const, label: 'Action', color: '#10B981', emoji: '✅' },
    { type: 'decision' as const, label: 'Decision', color: '#F59E0B', emoji: '⚡' },
    { type: 'question' as const, label: 'Question', color: '#EF4444', emoji: '❓' },
  ];

  const addNote = () => {
    if (!newNoteText.trim()) return;

    const note: Note = {
      id: Date.now().toString(),
      text: newNoteText.trim(),
      author: currentUser,
      timestamp: Date.now(),
      type: newNoteType,
    };

    setNotes(prev => [...prev, note]);
    onNoteAdd?.(note);
    setNewNoteText('');
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
  };

  const saveEdit = () => {
    if (!editingNoteId || !editingText.trim()) return;

    setNotes(prev => prev.map(note => 
      note.id === editingNoteId 
        ? { ...note, text: editingText.trim() }
        : note
    ));
    
    onNoteUpdate?.(editingNoteId, editingText.trim());
    setEditingNoteId(null);
    setEditingText('');
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditingText('');
  };

  const deleteNote = (noteId: string) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setNotes(prev => prev.filter(note => note.id !== noteId));
            onNoteDelete?.(noteId);
          },
        },
      ]
    );
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  const getTypeConfig = (type: Note['type']) => {
    return noteTypes.find(t => t.type === type) || noteTypes[0];
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Edit3 size={18} color="#FF8C00" />
        <Text style={styles.title}>Collaborative Notes</Text>
        <View style={styles.userIndicator}>
          <Users size={14} color="#6B7280" />
          <Text style={styles.userText}>{currentUser}</Text>
        </View>
      </View>

      {/* Add New Note */}
      <View style={styles.addNoteSection}>
        <View style={styles.noteTypeSelector}>
          {noteTypes.map((type) => (
            <TouchableOpacity
              key={type.type}
              style={[
                styles.typeButton,
                newNoteType === type.type && styles.selectedTypeButton,
                { borderColor: type.color }
              ]}
              onPress={() => setNewNoteType(type.type)}
            >
              <Text style={styles.typeEmoji}>{type.emoji}</Text>
              <Text style={[
                styles.typeLabel,
                newNoteType === type.type && { color: type.color }
              ]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.addNoteInput}>
          <TextInput
            style={styles.textInput}
            value={newNoteText}
            onChangeText={setNewNoteText}
            placeholder={`Add a ${getTypeConfig(newNoteType).label.toLowerCase()}...`}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.addButton,
              { backgroundColor: getTypeConfig(newNoteType).color }
            ]}
            onPress={addNote}
            disabled={!newNoteText.trim()}
          >
            <Plus size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Notes List */}
      <ScrollView style={styles.notesList} showsVerticalScrollIndicator={false}>
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Edit3 size={32} color="#D1D5DB" />
            <Text style={styles.emptyText}>No notes yet</Text>
            <Text style={styles.emptySubtext}>
              Add notes, action items, decisions, and questions during the meeting
            </Text>
          </View>
        ) : (
          notes.map((note) => {
            const typeConfig = getTypeConfig(note.type);
            const isEditing = editingNoteId === note.id;

            return (
              <View
                key={note.id}
                style={[
                  styles.noteCard,
                  { borderLeftColor: typeConfig.color }
                ]}
              >
                <View style={styles.noteHeader}>
                  <View style={styles.noteTypeIndicator}>
                    <Text style={styles.noteEmoji}>{typeConfig.emoji}</Text>
                    <Text style={[styles.noteType, { color: typeConfig.color }]}>
                      {typeConfig.label}
                    </Text>
                  </View>
                  <View style={styles.noteMeta}>
                    <Text style={styles.noteAuthor}>{note.author}</Text>
                    <Text style={styles.noteTime}>{formatTime(note.timestamp)}</Text>
                  </View>
                </View>

                {isEditing ? (
                  <View style={styles.editingContainer}>
                    <TextInput
                      style={styles.editInput}
                      value={editingText}
                      onChangeText={setEditingText}
                      multiline
                      autoFocus
                    />
                    <View style={styles.editActions}>
                      <TouchableOpacity style={styles.saveButton} onPress={saveEdit}>
                        <Check size={14} color="#10B981" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cancelButton} onPress={cancelEdit}>
                        <X size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.noteContent}>
                    <Text style={styles.noteText}>{note.text}</Text>
                    <View style={styles.noteActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => startEditing(note)}
                      >
                        <Edit3 size={12} color="#6B7280" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => deleteNote(note.id)}
                      >
                        <X size={12} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  userIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userText: {
    fontSize: 12,
    color: '#6B7280',
  },
  addNoteSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  noteTypeSelector: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 4,
  },
  selectedTypeButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
  },
  typeEmoji: {
    fontSize: 12,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
  },
  addNoteInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    maxHeight: 80,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notesList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  noteCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTypeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteEmoji: {
    fontSize: 14,
  },
  noteType: {
    fontSize: 12,
    fontWeight: '600',
  },
  noteMeta: {
    alignItems: 'flex-end',
  },
  noteAuthor: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  noteTime: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  noteContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  noteActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  actionButton: {
    padding: 4,
  },
  editingContainer: {
    gap: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#FF8C00',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  saveButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#F0FDF4',
  },
  cancelButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#FEF2F2',
  },
});