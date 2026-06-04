import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Users, 
  Clock, 
  CheckSquare, 
  AlertTriangle, 
  Plus, 
  Search, 
  BookOpen, 
  CheckCircle, 
  ArrowRight, 
  LogOut, 
  User, 
  Lock, 
  Mail, 
  Activity, 
  Send,
  Loader,
  MessageSquare,
  Sparkles,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { api } from './utils/api';

// Interface Definitions
interface UserProfile {
  id: string;
  email: string;
  name: string;
}

interface TranscriptSegment {
  timestamp: string;
  speaker: string;
  text: string;
}

interface AiContent {
  text: string;
  citations: { timestamp: string }[];
}

interface Meeting {
  _id: string;
  title: string;
  meetingDate: string;
  participants: string[];
  transcript: TranscriptSegment[];
  aiAnalysis?: {
    summary: AiContent[];
    decisions: AiContent[];
    followUps: AiContent[];
    generatedAt: string;
  };
  createdAt: string;
}

interface ActionItem {
  _id: string;
  meetingId: { _id: string; title: string } | string;
  task: string;
  assignee: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  dueDate: string;
  citations: { timestamp: string }[];
  notified: boolean;
}

export default function App() {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );
  
  // Auth Form State
  const [isRegister, setIsRegister] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Application Tab State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'meetings' | 'kanban' | 'admin'>('dashboard');
  
  // Meeting List State
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsSearch, setMeetingsSearch] = useState('');
  const [meetingsPage, setMeetingsPage] = useState(1);
  const [meetingsTotalPages, setMeetingsTotalPages] = useState(1);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  
  // Create Meeting State
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newParticipants, setNewParticipants] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().substring(0, 16));
  const [rawTranscript, setRawTranscript] = useState(
    "00:10 John: We should launch the backend server next Tuesday.\n00:20 Alice: Understood. I will prepare release notes and run verification tests."
  );
  const [createLoading, setCreateLoading] = useState(false);

  // Selected Meeting / Split View State
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [selectedMeetingTab, setSelectedMeetingTab] = useState<'summary' | 'decisions' | 'followups' | 'tasks'>('summary');
  const [selectedMeetingTasks, setSelectedMeetingTasks] = useState<ActionItem[]>([]);
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);

  // Kanban Board State
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterMeeting, setFilterMeeting] = useState('');

  // Admin Webhook State
  // Webhook URL managed through backend .env config
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<string[]>([]);
  const [healthStatus, setHealthStatus] = useState<'UP' | 'DOWN' | 'LOADING'>('LOADING');

  // Interactive Citation Ref
  const transcriptRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [highlightedTimestamp, setHighlightedTimestamp] = useState<string | null>(null);

  // Load Auth Details
  useEffect(() => {
    const handleLogout = () => {
      setToken(null);
      setCurrentUser(null);
    };
    window.addEventListener('auth-logout', handleLogout);
    return () => window.removeEventListener('auth-logout', handleLogout);
  }, []);

  // Fetch data on active tab change
  useEffect(() => {
    if (!token) return;
    if (activeTab === 'dashboard') {
      fetchDashboardStats();
    } else if (activeTab === 'meetings') {
      fetchMeetings();
    } else if (activeTab === 'kanban') {
      fetchActionItems();
    } else if (activeTab === 'admin') {
      fetchHealth();
    }
  }, [activeTab, token, meetingsPage, meetingsSearch]);

  // Retrieve health status
  const fetchHealth = async () => {
    try {
      setHealthStatus('LOADING');
      const res = await fetch('http://localhost:5000/health');
      if (res.ok) setHealthStatus('UP');
      else setHealthStatus('DOWN');
    } catch {
      setHealthStatus('DOWN');
    }
  };

  // Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (isRegister) {
        const data = await api.post('/api/auth/register', {
          name: authName,
          email: authEmail,
          password: authPassword
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setCurrentUser(data.user);
      } else {
        const data = await api.post('/api/auth/login', {
          email: authEmail,
          password: authPassword
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setCurrentUser(data.user);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
    setSelectedMeeting(null);
  };

  // Dashboard Stats state
  const [stats, setStats] = useState({
    totalMeetings: 0,
    totalAiAnalyses: 0,
    pendingTasks: 0,
    overdueTasks: 0
  });

  const fetchDashboardStats = async () => {
    try {
      const [meetingsData, tasksData, overdueData] = await Promise.all([
        api.get('/api/meetings?limit=100'),
        api.get('/api/action-items'),
        api.get('/api/action-items/overdue')
      ]);

      const meetingsList: Meeting[] = meetingsData.meetings || [];
      const tasksList: ActionItem[] = tasksData || [];
      const overdueList: ActionItem[] = overdueData || [];

      setStats({
        totalMeetings: meetingsList.length,
        totalAiAnalyses: meetingsList.filter(m => m.aiAnalysis).length,
        pendingTasks: tasksList.filter(t => t.status !== 'COMPLETED').length,
        overdueTasks: overdueList.length
      });

      // Quick list for dashboard
      setMeetings(meetingsList.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard metrics', err);
    }
  };

  // Fetch Meetings with Search & Pagination
  const fetchMeetings = async () => {
    try {
      setMeetingsLoading(true);
      const data = await api.get(`/api/meetings?page=${meetingsPage}&limit=6&search=${meetingsSearch}`);
      setMeetings(data.meetings || []);
      setMeetingsTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch meetings', err);
    } finally {
      setMeetingsLoading(false);
    }
  };

  // Fetch Action Items for Kanban
  const fetchActionItems = async () => {
    try {
      setKanbanLoading(true);
      const data = await api.get('/api/action-items');
      setActionItems(data || []);
    } catch (err) {
      console.error('Failed to fetch action items', err);
    } finally {
      setKanbanLoading(false);
    }
  };

  // Parse Raw Transcript lines (Format: "HH:MM Name: text dialogue")
  const parseTranscript = (rawText: string): TranscriptSegment[] => {
    const lines = rawText.split('\n');
    const segments: TranscriptSegment[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Match time code (e.g. 00:10 or 0:10)
      const match = trimmed.match(/^(\d{1,2}:\d{2})\s+([^:]+):\s*(.*)$/);
      if (match) {
        segments.push({
          timestamp: match[1],
          speaker: match[2].trim(),
          text: match[3].trim()
        });
      } else {
        // Fallback if not formatted properly
        segments.push({
          timestamp: "00:00",
          speaker: "Speaker",
          text: trimmed
        });
      }
    });

    return segments;
  };

  // Create New Meeting
  const handleCreateMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreateLoading(true);

    try {
      const parsedTranscript = parseTranscript(rawTranscript);
      const participantList = newParticipants
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      const createdMeeting = await api.post('/api/meetings', {
        title: newTitle,
        meetingDate: new Date(newDate).toISOString(),
        participants: participantList,
        transcript: parsedTranscript
      });

      setNewTitle('');
      setNewParticipants('');
      setRawTranscript("00:10 John: We should launch the backend server next Tuesday.\n00:20 Alice: Understood. I will prepare release notes and run verification tests.");
      setIsCreateMeetingOpen(false);
      
      // Auto analyze the newly created meeting instantly!
      await handleRunAnalysis(createdMeeting._id);
      
      setActiveTab('meetings');
      fetchMeetings();
    } catch (err: any) {
      alert(err.message || 'Failed to create meeting');
    } finally {
      setCreateLoading(false);
    }
  };

  // Request AI Analysis
  const handleRunAnalysis = async (meetingId: string) => {
    try {
      setAiAnalyzingId(meetingId);
      const data = await api.post(`/api/meetings/${meetingId}/analyze`);
      
      // Update selected meeting if open
      if (selectedMeeting && selectedMeeting._id === meetingId) {
        setSelectedMeeting(data.meeting);
        setSelectedMeetingTasks(data.actionItems || []);
      }
      
      // Refresh list
      fetchMeetings();
    } catch (err: any) {
      alert(err.message || 'AI Analysis failed');
    } finally {
      setAiAnalyzingId(null);
    }
  };

  // Load meeting details
  const handleSelectMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    try {
      // Load action items for this meeting
      const allTasks: ActionItem[] = await api.get(`/api/action-items?meetingId=${meeting._id}`);
      setSelectedMeetingTasks(allTasks);
    } catch (err) {
      console.error(err);
    }
  };

  // Update Action Item Status
  const handleUpdateStatus = async (taskId: string, newStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED') => {
    try {
      const updated = await api.patch(`/api/action-items/${taskId}/status`, { status: newStatus });
      
      // Update Kanban list
      setActionItems(prev => prev.map(item => item._id === taskId ? { ...item, status: updated.status } : item));
      
      // Update selected meeting tasks if open
      setSelectedMeetingTasks(prev => prev.map(item => item._id === taskId ? { ...item, status: updated.status } : item));
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // Trigger manual cron webhook
  const handleTriggerWebhook = async () => {
    try {
      setWebhookTesting(true);
      setWebhookLogs(['Starting manual trigger for overdue scheduler scan...']);
      
      const res = await api.post('/api/action-items/trigger-reminders');
      
      setWebhookLogs(prev => [
        ...prev,
        `Result: ${res.message}`,
        `Overdue action items processed: ${res.processedCount}`,
        `Notified successfully: ${res.successCount}`,
        `Failed alerts: ${res.failedCount}`,
        '--- Execution Logs ---',
        ...(res.logs || [])
      ]);
    } catch (err: any) {
      setWebhookLogs(prev => [...prev, `❌ Error: ${err.message}`]);
    } finally {
      setWebhookTesting(false);
    }
  };

  // Interactive Citation Trigger Scroll and Highlight
  const handleCitationClick = (timestamp: string) => {
    const el = transcriptRefs.current[timestamp];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedTimestamp(timestamp);
      
      // Remove highlight after 2.5 seconds
      setTimeout(() => {
        setHighlightedTimestamp(prev => prev === timestamp ? null : prev);
      }, 2500);
    }
  };

  // Group items by status for Kanban Board
  const getKanbanColumns = () => {
    const uniqueAssignees = Array.from(new Set(actionItems.map(item => item.assignee)));
    const uniqueMeetings = Array.from(new Set(actionItems.map(item => {
      return typeof item.meetingId === 'object' ? item.meetingId.title : 'Unknown Meeting';
    })));

    const filtered = actionItems.filter(item => {
      const matchAssignee = !filterAssignee || item.assignee === filterAssignee;
      const meetingTitle = typeof item.meetingId === 'object' ? item.meetingId.title : '';
      const matchMeeting = !filterMeeting || meetingTitle === filterMeeting;
      return matchAssignee && matchMeeting;
    });

    return {
      pending: filtered.filter(item => item.status === 'PENDING'),
      inProgress: filtered.filter(item => item.status === 'IN_PROGRESS'),
      completed: filtered.filter(item => item.status === 'COMPLETED'),
      assignees: uniqueAssignees,
      meetings: uniqueMeetings
    };
  };

  const kanban = getKanbanColumns();

  // Check if task is overdue
  const isOverdue = (item: ActionItem) => {
    return item.status !== 'COMPLETED' && new Date(item.dueDate) < new Date();
  };

  // ==========================================
  // RENDER LOGIN / REGISTER VIEW
  // ==========================================
  if (!token) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
        <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ 
              background: 'var(--grad-primary)', 
              width: '60px', 
              height: '60px', 
              borderRadius: '16px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              boxShadow: 'var(--shadow-glow)'
            }}>
              <Sparkles size={28} color="white" />
            </div>
            <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>IntelliMeet</h1>
            <p style={{ color: 'var(--text-secondary)' }}>AI-Powered Meeting Intelligence Service</p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {isRegister && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Enter your name" 
                    className="glass-input" 
                    style={{ width: '100%', paddingLeft: '48px' }}
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  placeholder="name@example.com" 
                  className="glass-input" 
                  style={{ width: '100%', paddingLeft: '48px' }}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="glass-input" 
                  style={{ width: '100%', paddingLeft: '48px' }}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {authError && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                color: 'var(--color-error)', 
                borderRadius: '8px', 
                padding: '12px 16px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={authLoading}>
              {authLoading ? (
                <Loader className="animate-spin" size={18} />
              ) : (
                <>
                  <span>{isRegister ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <button 
              onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}
            >
              {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER APP CORE DASHBOARD
  // ==========================================
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Navbar */}
      <header className="glass-card" style={{ 
        borderRadius: 0, 
        borderLeft: 0, 
        borderRight: 0, 
        borderTop: 0, 
        padding: '16px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(10, 11, 22, 0.8)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            background: 'var(--grad-primary)', 
            width: '36px', 
            height: '36px', 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <Sparkles size={18} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>IntelliMeet</span>
        </div>

        {/* Tab Navigation links */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn-secondary ${activeTab === 'dashboard' ? 'btn-primary' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setSelectedMeeting(null); }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: activeTab === 'dashboard' ? 'none' : '1px solid var(--border-glass)' }}
          >
            Dashboard
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'meetings' ? 'btn-primary' : ''}`}
            onClick={() => { setActiveTab('meetings'); }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: activeTab === 'meetings' ? 'none' : '1px solid var(--border-glass)' }}
          >
            Meetings
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'kanban' ? 'btn-primary' : ''}`}
            onClick={() => { setActiveTab('kanban'); setSelectedMeeting(null); }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: activeTab === 'kanban' ? 'none' : '1px solid var(--border-glass)' }}
          >
            Action Items
          </button>
          <button 
            className={`btn-secondary ${activeTab === 'admin' ? 'btn-primary' : ''}`}
            onClick={() => { setActiveTab('admin'); setSelectedMeeting(null); }}
            style={{ padding: '8px 16px', borderRadius: '8px', border: activeTab === 'admin' ? 'none' : '1px solid var(--border-glass)' }}
          >
            Webhook Engine
          </button>
        </nav>

        {/* User profile dropdown / logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: 600 }}>{currentUser?.name}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{currentUser?.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="btn-secondary" 
            style={{ padding: '8px', borderRadius: '8px' }}
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Body view */}
      <main style={{ flex: 1, padding: '40px' }}>

        {/* ==========================================
           TAB: DASHBOARD
           ========================================== */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
            
            {/* Stat Counters Section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', padding: '16px', borderRadius: '12px' }}>
                  <Calendar size={24} />
                </div>
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Meetings</p>
                  <h3 style={{ fontSize: '28px' }}>{stats.totalMeetings}</h3>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'rgba(168, 85, 247, 0.1)', color: 'var(--color-secondary)', padding: '16px', borderRadius: '12px' }}>
                  <Sparkles size={24} />
                </div>
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>AI Analyzed</p>
                  <h3 style={{ fontSize: '28px' }}>{stats.totalAiAnalyses}</h3>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-accent)', padding: '16px', borderRadius: '12px' }}>
                  <CheckSquare size={24} />
                </div>
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Pending Tasks</p>
                  <h3 style={{ fontSize: '28px' }}>{stats.pendingTasks}</h3>
                </div>
              </div>

              <div className="glass-card" style={{ 
                padding: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '20px',
                border: stats.overdueTasks > 0 ? '1px solid rgba(255, 51, 102, 0.3)' : '1px solid var(--border-glass)',
                boxShadow: stats.overdueTasks > 0 ? '0 0 20px rgba(255, 51, 102, 0.08)' : 'none'
              }}>
                <div style={{ 
                  background: stats.overdueTasks > 0 ? 'rgba(255, 51, 102, 0.12)' : 'rgba(239, 68, 68, 0.1)', 
                  color: stats.overdueTasks > 0 ? 'var(--color-overdue)' : 'var(--color-error)', 
                  padding: '16px', 
                  borderRadius: '12px',
                  animation: stats.overdueTasks > 0 ? 'pulse-border 2s infinite' : 'none'
                }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Overdue Alerts</p>
                  <h3 style={{ fontSize: '28px', color: stats.overdueTasks > 0 ? 'var(--color-overdue)' : 'inherit' }}>{stats.overdueTasks}</h3>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '40px', alignItems: 'start' }}>
              
              {/* Recent Meetings Panel */}
              <div className="glass-card" style={{ padding: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2>Recent Meetings</h2>
                  <button className="btn-secondary" onClick={() => setActiveTab('meetings')} style={{ padding: '6px 12px', fontSize: '13px' }}>
                    View All
                  </button>
                </div>

                {meetings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                    <HelpCircle size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
                    <p>No meetings found. Create your first meeting to begin extracting insights!</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {meetings.map((meeting) => (
                      <div 
                        key={meeting._id} 
                        className="glass-card" 
                        style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.01)' }}
                      >
                        <div>
                          <h4 style={{ fontSize: '16px', marginBottom: '4px' }}>{meeting.title}</h4>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={14} />
                              {new Date(meeting.meetingDate).toLocaleDateString()}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Users size={14} />
                              {meeting.participants.length} Attendees
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {meeting.aiAnalysis ? (
                            <span className="badge badge-completed">AI Analyzed</span>
                          ) : (
                            <span className="badge badge-pending">Pending AI</span>
                          )}
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                            onClick={() => { setSelectedMeeting(meeting); setActiveTab('meetings'); handleSelectMeeting(meeting); }}
                          >
                            Open Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Create Meeting Quick Drawer / Card */}
              <div className="glass-card" style={{ padding: '32px' }}>
                <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={20} color="var(--color-primary)" />
                  Quick Add Meeting
                </h3>
                <form onSubmit={handleCreateMeetingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Meeting Title</label>
                    <input 
                      type="text" 
                      placeholder="Sprint Retro" 
                      className="glass-input" 
                      value={newTitle} 
                      onChange={(e) => setNewTitle(e.target.value)}
                      required 
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Attendees (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="alice@example.com, bob@example.com" 
                      className="glass-input" 
                      value={newParticipants} 
                      onChange={(e) => setNewParticipants(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Meeting Date</label>
                    <input 
                      type="datetime-local" 
                      className="glass-input" 
                      value={newDate} 
                      onChange={(e) => setNewDate(e.target.value)}
                      required 
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Transcript dialogue (Format: "Time Name: dialogue")</label>
                    <textarea 
                      rows={6}
                      className="glass-input"
                      value={rawTranscript}
                      onChange={(e) => setRawTranscript(e.target.value)}
                      style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }} disabled={createLoading}>
                    {createLoading ? (
                      <Loader className="animate-spin" size={18} />
                    ) : (
                      <>
                        <span>Add & Analyze</span>
                        <Sparkles size={16} />
                      </>
                    )}
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* ==========================================
           TAB: MEETINGS
           ========================================== */}
        {activeTab === 'meetings' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* If selectedMeeting is not NULL, show the Split Screen view */}
            {selectedMeeting ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Meeting Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <button 
                      onClick={() => setSelectedMeeting(null)} 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '13px', marginBottom: '12px' }}
                    >
                      ← Back to List
                    </button>
                    <h1 style={{ fontSize: '28px' }}>{selectedMeeting.title}</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                      {new Date(selectedMeeting.meetingDate).toLocaleDateString()} at {new Date(selectedMeeting.meetingDate).toLocaleTimeString()}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      className="btn-primary" 
                      onClick={() => handleRunAnalysis(selectedMeeting._id)} 
                      disabled={aiAnalyzingId === selectedMeeting._id}
                    >
                      {aiAnalyzingId === selectedMeeting._id ? (
                        <>
                          <Loader className="animate-spin" size={16} />
                          <span>AI Parsing...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          <span>Re-Analyze AI Insights</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Split Screen Panel */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', height: '600px', alignItems: 'stretch' }}>
                  
                  {/* Left Panel: Transcript scrolling */}
                  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MessageSquare size={18} color="var(--color-primary)" />
                      Dialogue Transcript
                    </h3>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
                      {selectedMeeting.transcript.map((seg, idx) => (
                        <div 
                          key={idx}
                          ref={el => { transcriptRefs.current[seg.timestamp] = el; }}
                          style={{ 
                            padding: '16px', 
                            borderRadius: '8px', 
                            background: highlightedTimestamp === seg.timestamp ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.01)', 
                            border: highlightedTimestamp === seg.timestamp ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid var(--border-glass)',
                            transition: 'all 0.5s ease',
                            boxShadow: highlightedTimestamp === seg.timestamp ? '0 0 15px rgba(99, 102, 241, 0.1)' : 'none'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <strong style={{ color: 'var(--color-secondary)' }}>{seg.speaker}</strong>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                              {seg.timestamp}
                            </span>
                          </div>
                          <p style={{ fontSize: '14px', lineHeight: 1.5 }}>{seg.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: AI Analysis Insights Tab */}
                  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '20px', gap: '8px' }}>
                      <button 
                        className={`btn-secondary ${selectedMeetingTab === 'summary' ? 'btn-primary' : ''}`}
                        onClick={() => setSelectedMeetingTab('summary')}
                        style={{ border: 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', fontSize: '13px' }}
                      >
                        Summary
                      </button>
                      <button 
                        className={`btn-secondary ${selectedMeetingTab === 'decisions' ? 'btn-primary' : ''}`}
                        onClick={() => setSelectedMeetingTab('decisions')}
                        style={{ border: 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', fontSize: '13px' }}
                      >
                        Decisions
                      </button>
                      <button 
                        className={`btn-secondary ${selectedMeetingTab === 'followups' ? 'btn-primary' : ''}`}
                        onClick={() => setSelectedMeetingTab('followups')}
                        style={{ border: 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', fontSize: '13px' }}
                      >
                        Follow-Ups
                      </button>
                      <button 
                        className={`btn-secondary ${selectedMeetingTab === 'tasks' ? 'btn-primary' : ''}`}
                        onClick={() => setSelectedMeetingTab('tasks')}
                        style={{ border: 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', fontSize: '13px' }}
                      >
                        Tasks ({selectedMeetingTasks.length})
                      </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                      {!selectedMeeting.aiAnalysis ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
                          <Sparkles size={48} style={{ margin: '0 auto 16px auto', opacity: 0.3 }} />
                          <p style={{ marginBottom: '16px' }}>This meeting has not been analyzed by AI yet.</p>
                          <button 
                            className="btn-primary" 
                            onClick={() => handleRunAnalysis(selectedMeeting._id)}
                            disabled={aiAnalyzingId === selectedMeeting._id}
                          >
                            {aiAnalyzingId === selectedMeeting._id ? (
                              <Loader className="animate-spin" size={16} />
                            ) : (
                              <span>Analyze with Hintro AI</span>
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          
                          {/* TAB CONTENT: Summary */}
                          {selectedMeetingTab === 'summary' && (
                            selectedMeeting.aiAnalysis.summary.map((item, idx) => (
                              <div key={idx} className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                                <p style={{ fontSize: '14px', marginBottom: '8px' }}>{item.text}</p>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  {item.citations.map((c, cidx) => (
                                    <button 
                                      key={cidx} 
                                      onClick={() => handleCitationClick(c.timestamp)}
                                      className="badge badge-progress" 
                                      style={{ cursor: 'pointer', border: '1px solid rgba(99,102,241,0.3)', outline: 'none' }}
                                    >
                                      Cite: {c.timestamp}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}

                          {/* TAB CONTENT: Decisions */}
                          {selectedMeetingTab === 'decisions' && (
                            selectedMeeting.aiAnalysis.decisions.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>No decisions were noted during this meeting.</p>
                            ) : (
                              selectedMeeting.aiAnalysis.decisions.map((item, idx) => (
                                <div key={idx} className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                                  <p style={{ fontSize: '14px', marginBottom: '8px', fontWeight: 500 }}>{item.text}</p>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    {item.citations.map((c, cidx) => (
                                      <button 
                                        key={cidx} 
                                        onClick={() => handleCitationClick(c.timestamp)}
                                        className="badge badge-completed" 
                                        style={{ cursor: 'pointer', border: '1px solid rgba(16,185,129,0.3)' }}
                                      >
                                        Cite: {c.timestamp}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )
                          )}

                          {/* TAB CONTENT: Follow-Ups */}
                          {selectedMeetingTab === 'followups' && (
                            selectedMeeting.aiAnalysis.followUps.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>No follow-up suggestions generated.</p>
                            ) : (
                              selectedMeeting.aiAnalysis.followUps.map((item, idx) => (
                                <div key={idx} className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                                  <p style={{ fontSize: '14px', marginBottom: '8px' }}>{item.text}</p>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    {item.citations.map((c, cidx) => (
                                      <button 
                                        key={cidx} 
                                        onClick={() => handleCitationClick(c.timestamp)}
                                        className="badge badge-pending" 
                                        style={{ cursor: 'pointer', border: '1px solid rgba(245,158,11,0.3)' }}
                                      >
                                        Cite: {c.timestamp}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )
                          )}

                          {/* TAB CONTENT: Tasks */}
                          {selectedMeetingTab === 'tasks' && (
                            selectedMeetingTasks.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>No action items extracted from this meeting.</p>
                            ) : (
                              selectedMeetingTasks.map((item) => (
                                <div 
                                  key={item._id} 
                                  className="glass-card" 
                                  style={{ 
                                    padding: '20px', 
                                    border: isOverdue(item) ? '1px solid rgba(255, 51, 102, 0.3)' : '1px solid var(--border-glass)',
                                    boxShadow: isOverdue(item) ? '0 0 10px rgba(255, 51, 102, 0.05)' : 'none'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600 }}>{item.task}</h4>
                                    {isOverdue(item) ? (
                                      <span className="badge badge-overdue">Overdue</span>
                                    ) : item.status === 'COMPLETED' ? (
                                      <span className="badge badge-completed">Completed</span>
                                    ) : item.status === 'IN_PROGRESS' ? (
                                      <span className="badge badge-progress">In Progress</span>
                                    ) : (
                                      <span className="badge badge-pending">Pending</span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    <span>Assignee: <strong>{item.assignee}</strong></span>
                                    <span>Due: {new Date(item.dueDate).toLocaleDateString()}</span>
                                  </div>

                                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                                    <select 
                                      className="glass-input" 
                                      style={{ padding: '4px 8px', fontSize: '12px' }}
                                      value={item.status}
                                      onChange={(e) => handleUpdateStatus(item._id, e.target.value as any)}
                                    >
                                      <option value="PENDING">Pending</option>
                                      <option value="IN_PROGRESS">In Progress</option>
                                      <option value="COMPLETED">Completed</option>
                                    </select>

                                    {item.citations.map((c, cidx) => (
                                      <button 
                                        key={cidx} 
                                        onClick={() => handleCitationClick(c.timestamp)}
                                        className="badge badge-progress" 
                                        style={{ cursor: 'pointer', border: '1px solid rgba(99,102,241,0.3)' }}
                                      >
                                        Cite: {c.timestamp}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )
                          )}

                        </div>
                      )}
                    </div>
                  </div>

                </div>

              </div>
            ) : (
              // List Meetings View
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>Meetings Registry</h2>
                  <button className="btn-primary" onClick={() => setIsCreateMeetingOpen(true)}>
                    <Plus size={18} />
                    <span>Create Meeting</span>
                  </button>
                </div>

                {/* Filter and Search */}
                <div className="glass-card" style={{ padding: '16px', display: 'flex', gap: '16px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={18} style={{ position: 'absolute', left: '16px', top: '13px', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      placeholder="Search meetings by title..." 
                      className="glass-input" 
                      style={{ width: '100%', paddingLeft: '48px', paddingRight: '16px' }}
                      value={meetingsSearch}
                      onChange={(e) => { setMeetingsSearch(e.target.value); setMeetingsPage(1); }}
                    />
                  </div>
                </div>

                {meetingsLoading ? (
                  <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Loader className="animate-spin" size={40} style={{ margin: '0 auto' }} />
                  </div>
                ) : meetings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-secondary)' }}>
                    <BookOpen size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
                    <p>No meetings found matching your search.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                      {meetings.map((meeting) => (
                        <div key={meeting._id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                              <h3 style={{ fontSize: '18px' }}>{meeting.title}</h3>
                              {meeting.aiAnalysis ? (
                                <span className="badge badge-completed">Analyzed</span>
                              ) : (
                                <span className="badge badge-pending">No Analysis</span>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} />
                                {new Date(meeting.meetingDate).toLocaleDateString()}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Users size={14} />
                                {meeting.participants.length} Attendees
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                            <button 
                              className="btn-primary" 
                              style={{ flex: 1, padding: '8px', fontSize: '13px', justifyContent: 'center' }}
                              onClick={() => handleSelectMeeting(meeting)}
                            >
                              Open Details
                            </button>
                            {!meeting.aiAnalysis && (
                              <button 
                                className="btn-secondary"
                                style={{ padding: '8px', fontSize: '13px' }}
                                onClick={() => handleRunAnalysis(meeting._id)}
                                disabled={aiAnalyzingId === meeting._id}
                              >
                                {aiAnalyzingId === meeting._id ? (
                                  <Loader className="animate-spin" size={16} />
                                ) : (
                                  <Sparkles size={16} color="var(--color-secondary)" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {meetingsTotalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                        <button 
                          className="btn-secondary" 
                          disabled={meetingsPage <= 1}
                          onClick={() => setMeetingsPage(prev => prev - 1)}
                        >
                          Previous
                        </button>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: '14px' }}>
                          Page {meetingsPage} of {meetingsTotalPages}
                        </span>
                        <button 
                          className="btn-secondary" 
                          disabled={meetingsPage >= meetingsTotalPages}
                          onClick={() => setMeetingsPage(prev => prev + 1)}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Create Meeting Drawer modal overlay */}
                {isCreateMeetingOpen && (
                  <div style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    background: 'rgba(0,0,0,0.6)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    zIndex: 100,
                    backdropFilter: 'blur(4px)'
                  }}>
                    <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '560px', padding: '32px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3>Create New Meeting</h3>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          onClick={() => setIsCreateMeetingOpen(false)}
                        >
                          ✕
                        </button>
                      </div>

                      <form onSubmit={handleCreateMeetingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Meeting Title</label>
                          <input 
                            type="text" 
                            placeholder="Engineering Sync" 
                            className="glass-input" 
                            value={newTitle} 
                            onChange={(e) => setNewTitle(e.target.value)}
                            required 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Attendees (comma separated)</label>
                          <input 
                            type="text" 
                            placeholder="bob@example.com, john@example.com" 
                            className="glass-input" 
                            value={newParticipants} 
                            onChange={(e) => setNewParticipants(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Meeting Date</label>
                          <input 
                            type="datetime-local" 
                            className="glass-input" 
                            value={newDate} 
                            onChange={(e) => setNewDate(e.target.value)}
                            required 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Dialogue transcript (Format: "Time Name: dialogue")</label>
                          <textarea 
                            rows={8}
                            className="glass-input"
                            value={rawTranscript}
                            onChange={(e) => setRawTranscript(e.target.value)}
                            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                            required
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ flex: 1, justifyContent: 'center' }}
                            onClick={() => setIsCreateMeetingOpen(false)}
                          >
                            Cancel
                          </button>
                          <button 
                            type="submit" 
                            className="btn-primary" 
                            style={{ flex: 1, justifyContent: 'center' }}
                            disabled={createLoading}
                          >
                            {createLoading ? (
                              <Loader className="animate-spin" size={18} />
                            ) : (
                              <>
                                <span>Create & Analyze</span>
                                <Sparkles size={16} />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

        {/* ==========================================
           TAB: KANBAN BOARD
           ========================================== */}
        {activeTab === 'kanban' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h2>Checklist Kanban Board</h2>

            {/* Filter Section */}
            <div className="glass-card" style={{ padding: '16px', display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <select 
                  className="glass-input" 
                  style={{ width: '100%' }}
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                >
                  <option value="">Filter by Assignee (All)</option>
                  {kanban.assignees.map((name, idx) => (
                    <option key={idx} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <select 
                  className="glass-input" 
                  style={{ width: '100%' }}
                  value={filterMeeting}
                  onChange={(e) => setFilterMeeting(e.target.value)}
                >
                  <option value="">Filter by Meeting (All)</option>
                  {kanban.meetings.map((title, idx) => (
                    <option key={idx} value={title}>{title}</option>
                  ))}
                </select>
              </div>
            </div>

            {kanbanLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Loader className="animate-spin" size={40} style={{ margin: '0 auto' }} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', alignItems: 'start' }}>
                
                {/* COLUMN: Pending */}
                <div className="glass-card" style={{ padding: '20px', background: 'rgba(10, 11, 22, 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={16} color="var(--color-warning)" />
                      Pending ({kanban.pending.length})
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '300px' }}>
                    {kanban.pending.map((item) => (
                      <div 
                        key={item._id} 
                        className="glass-card" 
                        style={{ 
                          padding: '16px', 
                          background: 'rgba(255, 255, 255, 0.01)',
                          border: isOverdue(item) ? '1px solid rgba(255, 51, 102, 0.3)' : '1px solid var(--border-glass)',
                          boxShadow: isOverdue(item) ? '0 0 10px rgba(255, 51, 102, 0.05)' : 'none'
                        }}
                      >
                        <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>{item.task}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          <span>Meeting: <strong>{typeof item.meetingId === 'object' ? item.meetingId.title : 'Sync'}</strong></span>
                          <span>Assignee: <strong>{item.assignee}</strong></span>
                          <span style={{ color: isOverdue(item) ? 'var(--color-overdue)' : 'inherit', fontWeight: isOverdue(item) ? 600 : 'normal' }}>
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => handleUpdateStatus(item._id, 'IN_PROGRESS')}
                          >
                            Start Work →
                          </button>
                          {isOverdue(item) && <span className="badge badge-overdue">Overdue</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COLUMN: In Progress */}
                <div className="glass-card" style={{ padding: '20px', background: 'rgba(10, 11, 22, 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Activity size={16} color="var(--color-primary)" />
                      In Progress ({kanban.inProgress.length})
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '300px' }}>
                    {kanban.inProgress.map((item) => (
                      <div 
                        key={item._id} 
                        className="glass-card" 
                        style={{ 
                          padding: '16px', 
                          background: 'rgba(255, 255, 255, 0.01)',
                          border: isOverdue(item) ? '1px solid rgba(255, 51, 102, 0.3)' : '1px solid var(--border-glass)',
                          boxShadow: isOverdue(item) ? '0 0 10px rgba(255, 51, 102, 0.05)' : 'none'
                        }}
                      >
                        <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>{item.task}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          <span>Meeting: <strong>{typeof item.meetingId === 'object' ? item.meetingId.title : 'Sync'}</strong></span>
                          <span>Assignee: <strong>{item.assignee}</strong></span>
                          <span style={{ color: isOverdue(item) ? 'var(--color-overdue)' : 'inherit', fontWeight: isOverdue(item) ? 600 : 'normal' }}>
                            Due: {new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => handleUpdateStatus(item._id, 'PENDING')}
                          >
                            ← Back
                          </button>
                          <button 
                            className="btn-primary" 
                            style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--color-accent)' }}
                            onClick={() => handleUpdateStatus(item._id, 'COMPLETED')}
                          >
                            Complete ✔
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COLUMN: Completed */}
                <div className="glass-card" style={{ padding: '20px', background: 'rgba(10, 11, 22, 0.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={16} color="var(--color-accent)" />
                      Completed ({kanban.completed.length})
                    </h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '300px' }}>
                    {kanban.completed.map((item) => (
                      <div key={item._id} className="glass-card" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.01)', opacity: 0.75 }}>
                        <h4 style={{ fontSize: '14px', marginBottom: '12px', textDecoration: 'line-through' }}>{item.task}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          <span>Meeting: <strong>{typeof item.meetingId === 'object' ? item.meetingId.title : 'Sync'}</strong></span>
                          <span>Assignee: <strong>{item.assignee}</strong></span>
                        </div>
                        <div>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => handleUpdateStatus(item._id, 'IN_PROGRESS')}
                          >
                            Re-Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* ==========================================
           TAB: ADMIN WEBHOOK TEST SUITE
           ========================================== */}
        {activeTab === 'admin' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px', margin: '0 auto' }}>
            
            {/* Server Health Status */}
            <div className="glass-card" style={{ padding: '32px' }}>
              <h2>System Integration Controls</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Monitor backend health, review triggers, and execute manual webhook notification dispatches.</p>
              
              <div style={{ display: 'flex', gap: '24px', alignItems: 'center', borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)', padding: '20px 0', marginBottom: '24px' }}>
                <div>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Server Status:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {healthStatus === 'UP' ? (
                      <span className="badge badge-completed">● Online</span>
                    ) : healthStatus === 'DOWN' ? (
                      <span className="badge badge-overdue">● Offline</span>
                    ) : (
                      <span className="badge badge-pending">● Loading</span>
                    )}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Evaluation Metadata Endpoint:</span>
                  <div style={{ marginTop: '4px' }}>
                    <a 
                      href="http://localhost:5000/api/evaluation" 
                      target="_blank" 
                      rel="noreferrer"
                      style={{ fontSize: '13px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>GET /api/evaluation</span>
                      <ArrowRight size={14} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Webhook Dispatch Console */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>Background Cron Webhook Dispatcher</h3>
                  <button 
                    className="btn-primary" 
                    onClick={handleTriggerWebhook}
                    disabled={webhookTesting}
                  >
                    {webhookTesting ? (
                      <Loader className="animate-spin" size={16} />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>Trigger Reminders Check</span>
                  </button>
                </div>
                
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Triggers a manual database scan. If any action item is incomplete (PENDING or IN_PROGRESS) and its due date is in the past, a structured rich embed alert will be pushed to your Discord channel.
                </p>

                {/* Log Terminal Window */}
                <div style={{ 
                  background: 'rgba(0,0,0,0.85)', 
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px', 
                  padding: '20px', 
                  fontFamily: 'monospace', 
                  fontSize: '12px',
                  height: '240px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  color: '#a6e22e'
                }}>
                  {webhookLogs.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)' }}>Console terminal logs will be printed here after trigger execution...</span>
                  ) : (
                    webhookLogs.map((log, idx) => (
                      <div key={idx} style={{ color: log.startsWith('❌') ? 'var(--color-error)' : log.startsWith('Result') ? 'white' : '#a6e22e' }}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Footer copyright */}
      <footer style={{ 
        textAlign: 'center', 
        padding: '24px', 
        borderTop: '1px solid var(--border-glass)', 
        fontSize: '12px', 
        color: 'var(--text-muted)',
        background: 'rgba(10, 11, 22, 0.4)'
      }}>
        <span>IntelliMeet Meeting Intelligence Service © 2026. Made with ❤️ for Hintro Internship Review.</span>
      </footer>

    </div>
  );
}
