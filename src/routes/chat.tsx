import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  MessageSquare,
  Users,
  GraduationCap,
  BookOpen,
  Send,
  Paperclip,
  Share2,
  X,
  FileText,
  Image as ImageIcon,
  Download,
  Trash2,
  Sparkles,
  Lock,
  Plus,
  Hash,
  Eye,
  CheckCircle2,
  ChevronRight,
  UserCheck,
  Search,
  ExternalLink,
  Mail,
  ShieldCheck,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/platform.functions";
import {
  listChannels,
  listChannelMessages,
  sendChannelMessage,
  deleteChannelMessage,
  adminCreateChannel,
  adminDeleteChannel,
  listMyNotebooksForShare,
  getSharedStudyPreview,
  listDMConversations,
  startDMConversation,
  listDMMessages,
  sendDMMessage,
  listEligibleUsersForDM,
  type ChatChannel,
  type ChatMessage,
  type ChatAttachment,
} from "@/lib/chat.functions";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Community Chat & Channels — Vellum" },
      {
        name: "description",
        content: "Chat with peers, share resources, collaborate on study kits, and connect in student or parent circles.",
      },
    ],
  }),
  component: ChatRoute,
});

function ChatRoute() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Server functions
  const fetchMyProfile = useServerFn(getMyProfile);
  const fetchChannels = useServerFn(listChannels);
  const fetchMessages = useServerFn(listChannelMessages);
  const postMessage = useServerFn(sendChannelMessage);
  const removeMessage = useServerFn(deleteChannelMessage);
  const createChannelFn = useServerFn(adminCreateChannel);
  const deleteChannelFn = useServerFn(adminDeleteChannel);
  const fetchMyNotebooks = useServerFn(listMyNotebooksForShare);
  const fetchStudyPreview = useServerFn(getSharedStudyPreview);
  const fetchDMConversations = useServerFn(listDMConversations);
  const startDM = useServerFn(startDMConversation);
  const fetchDMMessages = useServerFn(listDMMessages);
  const postDMMessage = useServerFn(sendDMMessage);
  const fetchEligibleUsers = useServerFn(listEligibleUsersForDM);

  // State
  const [chatMode, setChatMode] = useState<"channels" | "dms">("channels");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedDMId, setSelectedDMId] = useState<string>("");
  const [dmInputText, setDmInputText] = useState("");
  const [dmSearchFilter, setDmSearchFilter] = useState("");
  const [inputText, setInputText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [audienceFilter, setAudienceFilter] = useState<"all" | "student" | "parent">("all");

  // Modals state
  const [newDMModalOpen, setNewDMModalOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelAudience, setNewChannelAudience] = useState<"both" | "student" | "parent">("both");
  const [newChannelIcon, setNewChannelIcon] = useState("hash");

  const [shareNotebookOpen, setShareNotebookOpen] = useState(false);
  const [previewKitOpen, setPreviewKitOpen] = useState(false);
  const [activePreviewKit, setActivePreviewKit] = useState<any>(null);
  const [loadingKitPreview, setLoadingKitPreview] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Realtime presence & typing state
  const [onlineUsers, setOnlineUsers] = useState<Array<{
    user_id: string;
    display_name: string;
    role: string;
    avatar_url?: string;
    student_id?: string;
  }>>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Redirect if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [authLoading, user, navigate]);

  // Profile & role query
  const { data: profileData } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchMyProfile(),
    enabled: !!user,
  });

  const roles = profileData?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isParent = roles.includes("parent");
  const userRole = isAdmin ? "admin" : isParent ? "parent" : "student";
  const myProfile = profileData?.profile;

  // Channels query
  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ["chat-channels", user?.id],
    queryFn: () => fetchChannels(),
    enabled: !!user,
  });

  const channels = channelsData?.channels ?? [];

  // Automatically select first channel
  useEffect(() => {
    if (channels.length > 0 && (!selectedChannelId || !channels.some((c) => c.id === selectedChannelId))) {
      const first = channels[0];
      if (first?.id) {
        setSelectedChannelId(first.id);
      }
    }
  }, [channels, selectedChannelId]);

  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

  // Messages query
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["chat-messages", selectedChannelId],
    queryFn: () => fetchMessages({ data: { channelId: selectedChannelId, limit: 60 } }),
    enabled: !!selectedChannelId && !!user,
    refetchInterval: 5000, // periodic sync fallback
  });

  const messages = messagesData?.messages ?? [];

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedChannelId]);

  // User's notebooks for sharing query
  const { data: notebooksData } = useQuery({
    queryKey: ["my-notebooks-for-share", user?.id],
    queryFn: () => fetchMyNotebooks(),
    enabled: !!user && shareNotebookOpen,
  });

  const myNotebooks = notebooksData?.notebooks ?? [];

  // DM queries
  const { data: dmConversationsData } = useQuery({
    queryKey: ["dm-conversations", user?.id],
    queryFn: () => fetchDMConversations(),
    enabled: !!user && chatMode === "dms",
  });
  const dmConversations = dmConversationsData?.conversations ?? [];

  const { data: eligibleUsersData, isLoading: eligibleUsersLoading } = useQuery({
    queryKey: ["eligible-users-dm", user?.id, userSearchTerm],
    queryFn: () => fetchEligibleUsers({ data: { search: userSearchTerm } }),
    enabled: !!user && (newDMModalOpen || chatMode === "dms"),
  });
  const eligibleUsers = eligibleUsersData?.users ?? [];

  const { data: dmMessagesData, isLoading: dmMessagesLoading } = useQuery({
    queryKey: ["dm-messages", selectedDMId],
    queryFn: () => fetchDMMessages({ data: { conversationId: selectedDMId, limit: 50 } }),
    enabled: !!selectedDMId && !!user && chatMode === "dms",
    refetchInterval: 4000,
  });
  const dmMessages = dmMessagesData?.messages ?? [];

  // Real-time DM Broadcast (live delivery for both participants)
  useEffect(() => {
    if (!selectedDMId || !user) return;

    const dmChannel = supabase.channel(`vellum:dm:${selectedDMId}`);

    dmChannel
      .on("broadcast", { event: "new_dm" }, (payload: any) => {
        if (payload.payload?.message) {
          qc.setQueryData(["dm-messages", selectedDMId], (old: any) => {
            const existing = old?.messages ?? [];
            if (existing.some((m: any) => m.id === payload.payload.message.id)) {
              return old;
            }
            return { messages: [...existing, payload.payload.message] };
          });
          qc.invalidateQueries({ queryKey: ["dm-conversations"] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dmChannel);
    };
  }, [selectedDMId, user, qc]);

  const sendDMMutation = useMutation({
    mutationFn: async () => {
      if (!dmInputText.trim() || !selectedDMId) return;
      const res = await postDMMessage({ data: { conversationId: selectedDMId, content: dmInputText.trim() } });
      return res.message;
    },
    onSuccess: (newMsg) => {
      if (!newMsg) return;
      setDmInputText("");
      qc.setQueryData(["dm-messages", selectedDMId], (old: any) => ({
        messages: [...(old?.messages ?? []), newMsg],
      }));
      qc.invalidateQueries({ queryKey: ["dm-conversations"] });

      // Realtime broadcast to recipient
      const channel = supabase.channel(`vellum:dm:${selectedDMId}`);
      channel.send({
        type: "broadcast",
        event: "new_dm",
        payload: { message: newMsg },
      });
    },
    onError: (err: any) => toast.error(err.message || "Failed to send DM."),
  });

  async function handleStartDM(peerId: string) {
    try {
      const res = await startDM({ data: { peerId } });
      setChatMode("dms");
      setSelectedDMId(res.conversationId);
      setNewDMModalOpen(false);
      qc.invalidateQueries({ queryKey: ["dm-conversations"] });
      toast.success("Private conversation opened!");
    } catch (err: any) {
      toast.error(err.message || "Could not start private chat.");
    }
  }

  // Real-time Presence & Typing Setup
  useEffect(() => {
    if (!user || !myProfile) return;

    // Presence Channel
    const presenceChannel = supabase.channel("vellum:presence", {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const usersList: any[] = [];
        for (const key in state) {
          const arr = state[key] as any[];
          if (arr && arr[0]) usersList.push(arr[0]);
        }
        setOnlineUsers(usersList);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            display_name: myProfile.display_name || user.email?.split("@")[0] || "User",
            role: userRole,
            avatar_url: myProfile.avatar_url,
            student_id: myProfile.student_id,
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [user, myProfile, userRole]);

  // Real-time Chat Broadcast (typing & immediate message arrival)
  useEffect(() => {
    if (!selectedChannelId || !user) return;

    const chatChannel = supabase.channel(`vellum:chat:${selectedChannelId}`);

    chatChannel
      .on("broadcast", { event: "typing" }, (payload: any) => {
        if (payload.payload?.userId && payload.payload.userId !== user.id) {
          const { userId, name, isTyping } = payload.payload;
          setTypingUsers((prev) => {
            const next = { ...prev };
            if (isTyping) next[userId] = name;
            else delete next[userId];
            return next;
          });

          // Clear after 3.5s automatically if not refreshed
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = { ...prev };
              delete next[userId];
              return next;
            });
          }, 3500);
        }
      })
      .on("broadcast", { event: "new_message" }, (payload: any) => {
        if (payload.payload?.message) {
          qc.setQueryData(["chat-messages", selectedChannelId], (old: any) => {
            const existing = old?.messages ?? [];
            if (existing.some((m: ChatMessage) => m.id === payload.payload.message.id)) {
              return old;
            }
            return { messages: [...existing, payload.payload.message] };
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [selectedChannelId, user, qc]);

  // Handle typing broadcast with debounce
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    if (!selectedChannelId || !user) return;

    const myName = myProfile?.display_name || user.email?.split("@")[0] || "Someone";
    const channel = supabase.channel(`vellum:chat:${selectedChannelId}`);

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id, name: myName, isTyping: true },
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: user.id, name: myName, isTyping: false },
      });
    }, 2500);
  }

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!inputText.trim() && pendingAttachments.length === 0) return;
      const res = await postMessage({
        data: {
          channelId: selectedChannelId,
          content: inputText.trim(),
          attachments: pendingAttachments,
        },
      });
      return res.message;
    },
    onSuccess: (newMsg) => {
      if (!newMsg) return;
      setInputText("");
      setPendingAttachments([]);

      // Optimistically append to query cache
      qc.setQueryData(["chat-messages", selectedChannelId], (old: any) => ({
        messages: [...(old?.messages ?? []), newMsg],
      }));

      // Broadcast to channel peers
      const channel = supabase.channel(`vellum:chat:${selectedChannelId}`);
      channel.send({
        type: "broadcast",
        event: "new_message",
        payload: { message: newMsg },
      });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to send message.");
    },
  });

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await removeMessage({ data: { messageId } });
      return messageId;
    },
    onSuccess: (deletedId) => {
      qc.setQueryData(["chat-messages", selectedChannelId], (old: any) => ({
        messages: (old?.messages ?? []).filter((m: ChatMessage) => m.id !== deletedId),
      }));
      toast.success("Message deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Could not delete message.");
    },
  });

  // Admin Create Channel mutation
  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!newChannelName.trim()) throw new Error("Channel name is required");
      return await createChannelFn({
        data: {
          name: newChannelName.trim(),
          description: newChannelDesc.trim(),
          target_audience: newChannelAudience,
          icon: newChannelIcon,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Channel #${res.channel.name} created!`);
      setCreateChannelOpen(false);
      setNewChannelName("");
      setNewChannelDesc("");
      qc.invalidateQueries({ queryKey: ["chat-channels"] });
      setSelectedChannelId(res.channel.id);
    },
    onError: (err: any) => {
      toast.error(err.message || "Could not create channel.");
    },
  });

  // Admin Delete Channel mutation
  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      await deleteChannelFn({ data: { channelId } });
      return channelId;
    },
    onSuccess: () => {
      toast.success("Channel deleted");
      qc.invalidateQueries({ queryKey: ["chat-channels"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Could not delete channel.");
    },
  });

  // File Upload Handler
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File is too large (maximum 20MB).");
      return;
    }

    setUploadingFile(true);
    try {
      const isImg = file.type.startsWith("image/");
      const path = `${user?.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

      let fileUrl = "";
      const { data, error } = await supabase.storage.from("chat-attachments").upload(path, file);

      if (!error && data) {
        const { data: pubData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
        fileUrl = pubData?.publicUrl || "";
      } else {
        // Fallback: create object URL or base64 data for inline preview
        fileUrl = URL.createObjectURL(file);
      }

      const attachment: ChatAttachment = {
        type: isImg ? "image" : "file",
        name: file.name,
        url: fileUrl,
        size: file.size,
        mime: file.type,
      };

      setPendingAttachments((prev) => [...prev, attachment]);
      toast.success(`Attached ${file.name}`);
    } catch {
      toast.error("Could not upload file.");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Attach a notebook to chat
  function attachNotebook(nb: any) {
    const attachment: ChatAttachment = {
      type: "notebook",
      name: nb.title,
      notebook_id: nb.id,
      notebook_title: nb.title,
      subject_code: nb.subject_code || "STUDY",
      summary: nb.description || "Shared study notebook",
      flashcards_count: nb.flashcards_count || 0,
      quiz_count: nb.quiz_count || 0,
      notes_count: nb.notes_count || 0,
    };

    setPendingAttachments((prev) => [...prev, attachment]);
    setShareNotebookOpen(false);
    toast.success(`Attached notebook "${nb.title}"`);
  }

  // Open Study Kit Preview Modal
  async function handleOpenStudyPreview(notebookId: string) {
    setLoadingKitPreview(true);
    setPreviewKitOpen(true);
    setActiveCardIndex(0);
    setCardFlipped(false);
    try {
      const data = await fetchStudyPreview({ data: { notebookId } });
      setActivePreviewKit(data);
    } catch (err: any) {
      toast.error(err.message || "Could not load shared study kit preview.");
      setPreviewKitOpen(false);
    } finally {
      setLoadingKitPreview(false);
    }
  }

  // Filter channels based on tab
  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      if (audienceFilter === "all") return true;
      if (audienceFilter === "student") return c.target_audience === "student" || c.target_audience === "both";
      if (audienceFilter === "parent") return c.target_audience === "parent" || c.target_audience === "both";
      return true;
    });
  }, [channels, audienceFilter]);

  // Channel icon resolver
  function getChannelIcon(iconName: string) {
    switch (iconName) {
      case "graduation-cap":
        return <GraduationCap className="size-4 text-primary" />;
      case "users":
        return <Users className="size-4 text-amber-500" />;
      case "book-open":
        return <BookOpen className="size-4 text-emerald-500" />;
      case "sparkles":
        return <Sparkles className="size-4 text-purple-400" />;
      default:
        return <Hash className="size-4 text-muted-foreground" />;
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-3 pt-4 pb-12 sm:px-6 md:px-8">
        {/* Top Header Card */}
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5 mb-4 border border-border/40 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
              {chatMode === "channels" ? (
                <MessageSquare className="size-6" />
              ) : (
                <Mail className="size-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                  {chatMode === "channels" ? "Community Lounges & Channels" : "Private Direct Messages"}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-500 border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {onlineUsers.length} Online
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {chatMode === "channels"
                  ? "Real-time study channels for students and parents. Share files, notes, and study kits securely."
                  : "Private 1-on-1 conversations with fellow students, parents, and mentors. Safe, direct, and private."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex rounded-xl bg-background/60 p-1 border border-border/30 text-xs">
              <button
                onClick={() => setChatMode("channels")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition cursor-pointer ${
                  chatMode === "channels" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Hash className="size-3.5" /> Channels
              </button>
              <button
                onClick={() => setChatMode("dms")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition cursor-pointer ${
                  chatMode === "dms" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mail className="size-3.5" /> Messages
                {dmConversations.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary/20 text-primary px-1.5 py-0.2 text-[9px] font-bold">
                    {dmConversations.length}
                  </span>
                )}
              </button>
            </div>

            {isAdmin && chatMode === "channels" && (
              <button
                onClick={() => setCreateChannelOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 cursor-pointer"
              >
                <Plus className="size-3.5" /> New Channel
              </button>
            )}

            {chatMode === "dms" && (
              <button
                onClick={() => setNewDMModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 cursor-pointer"
              >
                <Plus className="size-3.5" /> New Message
              </button>
            )}

            <button
              onClick={() => setShowMembers(!showMembers)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium border transition cursor-pointer ${
                showMembers
                  ? "bg-secondary text-foreground border-border"
                  : "glass-fill text-muted-foreground hover:text-foreground border-border/40"
              }`}
            >
              <Users className="size-3.5" />
              <span>Members ({onlineUsers.length})</span>
            </button>
          </div>
        </div>

        {/* 3-Column Chat Layout */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 min-h-[680px]">
          {/* LEFT: Channels Navigation Sidebar */}
          <div className="lg:col-span-3 flex flex-col glass rounded-3xl p-4 border border-border/40">
            {chatMode === "channels" && (
              <>
                {/* Audience Tabs */}
                <div className="flex rounded-xl bg-background/60 p-1 mb-3 border border-border/30 text-xs">
                  <button
                    onClick={() => setAudienceFilter("all")}
                    className={`flex-1 rounded-lg py-1.5 font-medium transition cursor-pointer ${
                      audienceFilter === "all" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                  {(userRole === "student" || isAdmin) && (
                    <button
                      onClick={() => setAudienceFilter("student")}
                      className={`flex-1 rounded-lg py-1.5 font-medium transition cursor-pointer ${
                        audienceFilter === "student" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Students
                    </button>
                  )}
                  {(userRole === "parent" || isAdmin) && (
                    <button
                      onClick={() => setAudienceFilter("parent")}
                      className={`flex-1 rounded-lg py-1.5 font-medium transition cursor-pointer ${
                        audienceFilter === "parent" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Parents
                    </button>
                  )}
                </div>

                {/* Channels List */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    CHANNELS ({filteredChannels.length})
                  </p>

                  {channelsLoading ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">Loading channels…</div>
                  ) : filteredChannels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">No channels in this view.</div>
                  ) : (
                    filteredChannels.map((c) => {
                      const isSelected = c.id === selectedChannelId;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelectedChannelId(c.id)}
                          className={`w-full group flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                            isSelected
                              ? "bg-primary/15 text-primary font-semibold border border-primary/30 shadow-xs"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="shrink-0">{getChannelIcon(c.icon)}</span>
                            <span className="truncate">{c.name}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            {c.target_audience === "student" && (
                              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-500">
                                Student
                              </span>
                            )}
                            {c.target_audience === "parent" && (
                              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500">
                                Parent
                              </span>
                            )}
                            {isAdmin && !c.is_default && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete channel #${c.name}?`)) {
                                    deleteChannelMutation.mutate(c.id);
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition"
                                title="Delete channel"
                              >
                                <Trash2 className="size-3" />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {chatMode === "dms" && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Search / Filter input */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <input
                    value={dmSearchFilter}
                    onChange={(e) => setDmSearchFilter(e.target.value)}
                    placeholder="Filter chats…"
                    className="w-full rounded-xl bg-background/60 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground border border-border/30 outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  {dmSearchFilter && (
                    <button
                      onClick={() => setDmSearchFilter("")}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* New Chat Button */}
                <button
                  type="button"
                  onClick={() => setNewDMModalOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 border border-primary/25 hover:bg-primary/20 text-primary py-2 text-xs font-semibold transition cursor-pointer mb-2.5"
                >
                  <Plus className="size-3.5" /> Start New Private Chat
                </button>

                {/* Conversations list */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    CONVERSATIONS ({dmConversations.length})
                  </p>

                  {dmConversations.length === 0 ? (
                    <div className="p-4 text-center">
                      <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2">
                        <Mail className="size-5" />
                      </div>
                      <p className="text-xs font-medium text-foreground">No conversations yet</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Select a peer below or click "Start New Private Chat".
                      </p>
                    </div>
                  ) : (
                    dmConversations
                      .filter((c: any) =>
                        !dmSearchFilter ||
                        c.peerName.toLowerCase().includes(dmSearchFilter.toLowerCase()) ||
                        (c.lastMessage && c.lastMessage.toLowerCase().includes(dmSearchFilter.toLowerCase()))
                      )
                      .map((conv: any) => {
                        const isSelected = conv.id === selectedDMId;
                        const isOnline = onlineUsers.some((u) => u.user_id === conv.peerId);
                        return (
                          <button
                            key={conv.id}
                            onClick={() => setSelectedDMId(conv.id)}
                            className={`w-full group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                              isSelected
                                ? "bg-primary/15 text-primary font-semibold border border-primary/30 shadow-xs"
                                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                            }`}
                          >
                            <div className="relative shrink-0">
                              <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-[11px] font-bold text-foreground border border-border/40">
                                {conv.peerName?.[0]?.toUpperCase() || "U"}
                              </div>
                              {isOnline && (
                                <span className="absolute bottom-0 right-0 size-2 rounded-full bg-emerald-500 border border-background" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className="font-medium text-foreground truncate">{conv.peerName}</p>
                                {conv.lastMessageAt && (
                                  <span className="text-[9px] text-muted-foreground shrink-0">
                                    {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">{conv.lastMessage || "Start chatting…"}</p>
                            </div>
                          </button>
                        );
                      })
                  )}

                  {/* Online Peers Quick Pick */}
                  {onlineUsers.filter((u) => u.user_id !== user?.id).length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border/30">
                      <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        PEERS ONLINE ({onlineUsers.filter((u) => u.user_id !== user?.id).length})
                      </p>
                      <div className="space-y-1 mt-1">
                        {onlineUsers
                          .filter((u) => u.user_id !== user?.id)
                          .slice(0, 5)
                          .map((u) => (
                            <div
                              key={u.user_id}
                              onClick={() => handleStartDM(u.user_id)}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-primary/10 transition text-xs cursor-pointer group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="relative shrink-0">
                                  <div className="size-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground">
                                    {u.display_name?.[0]?.toUpperCase() || "U"}
                                  </div>
                                  <span className="absolute bottom-0 right-0 size-1.5 rounded-full bg-emerald-500" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium text-foreground">{u.display_name}</p>
                                  <p className="text-[9px] text-muted-foreground capitalize">{u.role}</p>
                                </div>
                              </div>
                              <span className="p-1 rounded-lg text-primary opacity-0 group-hover:opacity-100 transition">
                                <Mail className="size-3" />
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Current User Presence Card */}
            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between px-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative">
                  <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {(myProfile?.display_name || user?.email || "U")[0].toUpperCase()}
                  </div>
                  <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {myProfile?.display_name || user?.email?.split("@")[0]}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">{userRole}</p>
                </div>
              </div>
              {myProfile?.student_id && (
                <span className="font-mono text-[10px] bg-muted/60 px-2 py-0.5 rounded-md text-muted-foreground">
                  {myProfile.student_id}
                </span>
              )}
            </div>
          </div>

          {/* CENTER: Main Chat Messages & Composer */}
          <div className={`${showMembers ? "lg:col-span-6" : "lg:col-span-9"} flex flex-col glass rounded-3xl border border-border/40 overflow-hidden`}>
            {chatMode === "channels" && (
              <>
                {/* Active Channel Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-background/40 backdrop-blur-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-1.5 rounded-lg bg-muted/60">
                  {getChannelIcon(activeChannel?.icon || "hash")}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-bold text-foreground truncate">
                      #{activeChannel?.name || "Lounge"}
                    </h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                      {activeChannel?.target_audience === "both" ? "Everyone" : `${activeChannel?.target_audience}s Only`}
                    </span>
                  </div>
                  {activeChannel?.description && (
                    <p className="text-[11px] text-muted-foreground truncate max-w-md">
                      {activeChannel.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Typing notification badge */}
              {Object.keys(typingUsers).length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 px-2.5 py-1 rounded-full animate-pulse">
                  <span className="size-1.5 rounded-full bg-primary" />
                  <span>
                    {Object.values(typingUsers).slice(0, 2).join(", ")} is typing…
                  </span>
                </div>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar min-h-[420px]">
              {messagesLoading && messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Loading channel conversation…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-3">
                    <MessageSquare className="size-6" />
                  </div>
                  <h3 className="font-display text-base font-semibold">Welcome to #{activeChannel?.name}!</h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    This is the start of this channel. Say hello, ask a study question, or attach a notebook or file!
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.user_id === user?.id;
                  const canDelete = isMine || isAdmin;
                  return (
                    <div
                      key={msg.id}
                      className={`group flex items-start gap-3 rounded-2xl p-2.5 transition-colors ${
                        isMine ? "bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      {/* Author Avatar */}
                      <div className="relative shrink-0">
                        <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground border border-border/60">
                          {msg.author.display_name?.[0]?.toUpperCase() || "U"}
                        </div>
                      </div>

                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">
                              {msg.author.display_name}
                            </span>

                            {/* Role Badge */}
                            {msg.author.role === "admin" && (
                              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.2 text-[9px] font-bold text-emerald-500 border border-emerald-500/20">
                                ADMIN
                              </span>
                            )}
                            {msg.author.role === "parent" && (
                              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-bold text-amber-500 border border-amber-500/20">
                                PARENT
                              </span>
                            )}
                            {msg.author.role === "student" && (
                              <span className="rounded-md bg-blue-500/15 px-1.5 py-0.2 text-[9px] font-bold text-blue-500 border border-blue-500/20">
                                STUDENT
                              </span>
                            )}

                            {msg.author.student_id && (
                              <span className="font-mono text-[9px] text-muted-foreground">
                                • {msg.author.student_id}
                              </span>
                            )}

                            <span className="text-[10px] text-muted-foreground">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          {canDelete && (
                            <button
                              onClick={() => deleteMutation.mutate(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition cursor-pointer"
                              title="Delete message"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Body text */}
                        {msg.content && (
                          <p className="mt-1 text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                            {msg.content}
                          </p>
                        )}

                        {/* Attachments rendering */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2.5 space-y-2">
                            {msg.attachments.map((att, idx) => {
                              // 1. Image preview
                              if (att.type === "image" && att.url) {
                                return (
                                  <div key={idx} className="max-w-sm rounded-xl overflow-hidden border border-border/60 bg-black/20">
                                    <img
                                      src={att.url}
                                      alt={att.name}
                                      onClick={() => setLightboxImage(att.url || null)}
                                      className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition"
                                    />
                                    <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground bg-background/80">
                                      <span className="truncate">{att.name}</span>
                                      <a
                                        href={att.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={att.name}
                                        className="hover:text-primary transition"
                                      >
                                        <Download className="size-3" />
                                      </a>
                                    </div>
                                  </div>
                                );
                              }

                              // 2. Shared Notebook Card
                              if (att.type === "notebook") {
                                return (
                                  <div
                                    key={idx}
                                    className="max-w-md rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-xs"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <span className="font-mono text-[9px] font-semibold text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full">
                                          {att.subject_code || "STUDY KIT"}
                                        </span>
                                        <h4 className="mt-1.5 font-display text-sm font-bold text-foreground">
                                          {att.notebook_title || att.name}
                                        </h4>
                                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                          {att.summary}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Stats Chips */}
                                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                                      <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border/40">
                                        ⚡ {att.flashcards_count || 10} Flashcards
                                      </span>
                                      <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border/40">
                                        🎯 {att.quiz_count || 6} Questions
                                      </span>
                                      <span className="rounded-md bg-background/80 px-2 py-0.5 border border-border/40">
                                        📝 {att.notes_count || 5} Notes
                                      </span>
                                    </div>

                                    {/* Interactive Action Button */}
                                    <div className="mt-3 pt-2.5 border-t border-primary/20 flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-[10px] text-muted-foreground">Shared study resource</span>
                                      {att.notebook_id && (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenStudyPreview(att.notebook_id!)}
                                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/25 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition cursor-pointer"
                                          >
                                            <Eye className="size-3" /> Preview
                                          </button>
                                          <a
                                            href={`/notebook/${att.notebook_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:brightness-110 transition cursor-pointer"
                                          >
                                            <ExternalLink className="size-3" /> Full Kit
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              // 3. Generic File Attachment (PDF, docs, etc)
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-3 max-w-sm rounded-xl border border-border/60 bg-background/60 p-3 text-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <FileText className="size-5 shrink-0 text-primary" />
                                    <div className="min-w-0">
                                      <p className="font-medium text-foreground truncate">{att.name}</p>
                                      {att.size && (
                                        <p className="text-[10px] text-muted-foreground">
                                          {(att.size / 1024).toFixed(0)} KB
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {att.url && (
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={att.name}
                                      className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                                    >
                                      <Download className="size-4" />
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer Bar */}
            <div className="p-3 sm:p-4 border-t border-border/40 bg-background/60 backdrop-blur-md">
              {/* Pending Attachments Bar */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-xl bg-muted/40 border border-border/40">
                  {pendingAttachments.map((att, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-background px-2.5 py-1 text-xs border border-border/60 text-foreground"
                    >
                      {att.type === "image" && <ImageIcon className="size-3.5 text-primary" />}
                      {att.type === "notebook" && <BookOpen className="size-3.5 text-amber-500" />}
                      {att.type === "file" && <FileText className="size-3.5 text-blue-500" />}
                      <span className="max-w-[150px] truncate">{att.name}</span>
                      <button
                        onClick={() =>
                          setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="text-muted-foreground hover:text-destructive cursor-pointer ml-1"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMutation.mutate();
                }}
                className="flex items-end gap-2"
              >
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,application/pdf,text/*"
                />

                {/* Attach File Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="size-9 rounded-xl glass-fill flex items-center justify-center text-muted-foreground hover:text-foreground transition cursor-pointer shrink-0"
                  title="Attach file or image"
                >
                  <Paperclip className="size-4" />
                </button>

                {/* Share Notebook Button */}
                <button
                  type="button"
                  onClick={() => setShareNotebookOpen(true)}
                  className="size-9 rounded-xl glass-fill flex items-center justify-center text-muted-foreground hover:text-foreground transition cursor-pointer shrink-0"
                  title="Share one of your study notebooks"
                >
                  <BookOpen className="size-4" />
                </button>

                {/* Message Textarea */}
                <textarea
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMutation.mutate();
                    }
                  }}
                  placeholder={`Message #${activeChannel?.name || "lounge"}… (Enter to send, Shift+Enter for newline)`}
                  rows={1}
                  className="flex-1 max-h-32 min-h-[38px] rounded-xl bg-background/80 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground border border-border/60 outline-none focus:ring-2 focus:ring-primary/40 resize-none transition"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={sendMutation.isPending || (!inputText.trim() && pendingAttachments.length === 0)}
                  className="size-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-sm hover:brightness-110 transition disabled:opacity-50 shrink-0 cursor-pointer"
                  title="Send message"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </div>
            </>
            )}

            {chatMode === "dms" && !selectedDMId && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[500px]">
                <div className="size-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shadow-lg shadow-primary/5">
                  <Mail className="size-8" />
                </div>
                <h3 className="font-display text-xl font-bold text-foreground">Private Direct Messaging</h3>
                <p className="mt-2 text-xs text-muted-foreground max-w-md leading-relaxed">
                  Connect privately with fellow students, parents, or educators. All direct messages are private and confidential between participants.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => setNewDMModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:brightness-110 transition cursor-pointer"
                  >
                    <Plus className="size-3.5" /> Start New Private Chat
                  </button>
                  <button
                    onClick={() => setChatMode("channels")}
                    className="inline-flex items-center gap-2 rounded-xl glass-fill border border-border/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition cursor-pointer"
                  >
                    <Hash className="size-3.5" /> Browse Community Lounges
                  </button>
                </div>

                {eligibleUsers.length > 0 && (
                  <div className="mt-8 w-full max-w-md border-t border-border/30 pt-6">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-3 text-left">
                      Suggested Peers to Chat With
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {eligibleUsers.slice(0, 4).map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleStartDM(u.id)}
                          className="flex items-center gap-2.5 p-2 rounded-xl glass-fill border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition text-left cursor-pointer"
                        >
                          <div className="relative shrink-0">
                            <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-[11px] font-bold text-foreground">
                              {u.display_name?.[0]?.toUpperCase() || "U"}
                            </div>
                            {onlineUsers.some((o) => o.user_id === u.id) && (
                              <span className="absolute bottom-0 right-0 size-2 rounded-full bg-emerald-500 border border-background" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate text-foreground">{u.display_name}</p>
                            <span className="text-[10px] text-muted-foreground capitalize">{u.role}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {chatMode === "dms" && selectedDMId && (
              <>
                {/* Active DM Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-background/40 backdrop-blur-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground border border-border/60">
                        {(dmConversations.find((c: any) => c.id === selectedDMId)?.peerName || "U")[0]?.toUpperCase()}
                      </div>
                      {onlineUsers.some((u) => u.user_id === dmConversations.find((c: any) => c.id === selectedDMId)?.peerId) && (
                        <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-sm font-bold text-foreground truncate">
                          {dmConversations.find((c: any) => c.id === selectedDMId)?.peerName || "Direct Message"}
                        </h2>
                        {dmConversations.find((c: any) => c.id === selectedDMId)?.peerStudentId && (
                          <span className="font-mono text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                            {dmConversations.find((c: any) => c.id === selectedDMId)?.peerStudentId}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                          <ShieldCheck className="size-3" /> Private Chat
                        </span>
                        <span>•</span>
                        <span>
                          {onlineUsers.some((u) => u.user_id === dmConversations.find((c: any) => c.id === selectedDMId)?.peerId)
                            ? "Active now"
                            : "Offline"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedDMId("")}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition cursor-pointer"
                    title="Close conversation"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* DM Messages Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-scrollbar min-h-[420px]">
                  {dmMessagesLoading && dmMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Loading messages…
                    </div>
                  ) : dmMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-3">
                        <Mail className="size-6" />
                      </div>
                      <h3 className="font-display text-base font-semibold">Say hello!</h3>
                      <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                        This is the beginning of your private message history with this user.
                      </p>
                    </div>
                  ) : (
                    dmMessages.map((msg: any) => {
                      const isMine = msg.isMine;
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2.5 ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          {!isMine && (
                            <div className="size-8 shrink-0 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground border border-border/60">
                              {msg.senderName?.[0]?.toUpperCase() || "U"}
                            </div>
                          )}
                          
                          <div className={`flex flex-col gap-1 max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-[13px] shadow-xs ${
                                isMine 
                                  ? "bg-primary text-primary-foreground rounded-br-xs shadow-primary/10" 
                                  : "glass-fill text-foreground border border-border/40 rounded-bl-xs"
                              }`}
                            >
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground px-1">
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {isMine && <CheckCheck className="size-3 text-primary opacity-80" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* DM Composer Bar */}
                <div className="p-3 sm:p-4 border-t border-border/40 bg-background/60 backdrop-blur-md">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendDMMutation.mutate();
                    }}
                    className="flex items-end gap-2"
                  >
                    <textarea
                      value={dmInputText}
                      onChange={(e) => setDmInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendDMMutation.mutate();
                        }
                      }}
                      placeholder={`Message ${dmConversations.find((c: any) => c.id === selectedDMId)?.peerName || "peer"}… (Enter to send, Shift+Enter for newline)`}
                      rows={1}
                      disabled={!selectedDMId}
                      className="flex-1 max-h-32 min-h-[38px] rounded-xl bg-background/80 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground border border-border/60 outline-none focus:ring-2 focus:ring-primary/40 resize-none transition"
                    />
                    <button
                      type="submit"
                      disabled={sendDMMutation.isPending || !dmInputText.trim() || !selectedDMId}
                      className="size-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-sm hover:brightness-110 transition disabled:opacity-50 shrink-0 cursor-pointer"
                      title="Send DM"
                    >
                      <Send className="size-4" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Active Online Members Sidebar */}
          {showMembers && (
            <div className="lg:col-span-3 flex flex-col glass rounded-3xl p-4 border border-border/40">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  ONLINE USERS ({onlineUsers.length})
                </p>
                <button
                  onClick={() => setShowMembers(false)}
                  className="text-muted-foreground hover:text-foreground lg:hidden cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pt-3 custom-scrollbar">
                {onlineUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Connecting to presence…</p>
                ) : (
                  onlineUsers.map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl px-2.5 py-2 hover:bg-muted/40 transition text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div className="size-7 rounded-full bg-secondary flex items-center justify-center text-[11px] font-bold text-foreground">
                            {u.display_name?.[0]?.toUpperCase() || "U"}
                          </div>
                          <span className="absolute bottom-0 right-0 size-2 rounded-full bg-emerald-500 border border-background" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{u.display_name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{u.role}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {u.student_id && (
                          <span className="font-mono text-[9px] text-muted-foreground shrink-0 bg-muted/60 px-1.5 py-0.5 rounded">
                            {u.student_id}
                          </span>
                        )}
                        {u.user_id !== user?.id && (
                          <button
                            onClick={() => handleStartDM(u.user_id)}
                            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition cursor-pointer"
                            title="Direct Message"
                          >
                            <Mail className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL: Start New Private Direct Message */}
        {newDMModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass w-full max-w-md rounded-3xl p-6 border border-border/60 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Mail className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">New Private Chat</h3>
                    <p className="text-[11px] text-muted-foreground">Select a peer to start a 1-on-1 private direct message</p>
                  </div>
                </div>
                <button
                  onClick={() => setNewDMModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-muted/50 transition"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* User search bar */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  placeholder="Search students, parents, or admins..."
                  className="w-full rounded-xl bg-background/80 pl-9 pr-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground border border-border/60 outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>

              {/* Users list */}
              <div className="mt-3.5 max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {eligibleUsersLoading ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">Loading members…</p>
                ) : eligibleUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs font-medium text-foreground">No matching members</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Try searching with a different name</p>
                  </div>
                ) : (
                  eligibleUsers.map((u) => {
                    const isOnline = onlineUsers.some((o) => o.user_id === u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => handleStartDM(u.id)}
                        className="group flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-3 hover:border-primary/40 hover:bg-primary/5 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="size-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">
                              {u.display_name?.[0]?.toUpperCase() || "U"}
                            </div>
                            {isOnline && (
                              <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-foreground truncate">{u.display_name}</span>
                              <span className="rounded-md bg-muted px-1.5 py-0.2 text-[9px] font-medium text-muted-foreground capitalize">
                                {u.role}
                              </span>
                            </div>
                            {u.student_id && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {u.student_id}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition shrink-0"
                        >
                          Message
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Admin Create Channel */}
        {createChannelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass w-full max-w-md rounded-3xl p-6 border border-border/60 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Plus className="size-5 text-primary" />
                  <h3 className="font-display text-lg font-bold">Create New Channel</h3>
                </div>
                <button
                  onClick={() => setCreateChannelOpen(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-foreground">Channel Name</label>
                  <input
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g. Exam Prep, Calculus Help"
                    className="mt-1 w-full rounded-xl bg-background/80 px-3.5 py-2.5 text-xs text-foreground border border-border/60 outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Description</label>
                  <input
                    value={newChannelDesc}
                    onChange={(e) => setNewChannelDesc(e.target.value)}
                    placeholder="What is this channel about?"
                    className="mt-1 w-full rounded-xl bg-background/80 px-3.5 py-2.5 text-xs text-foreground border border-border/60 outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Target Audience</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {[
                      { id: "both", label: "Everyone" },
                      { id: "student", label: "Students" },
                      { id: "parent", label: "Parents" },
                    ].map((aud) => (
                      <button
                        key={aud.id}
                        type="button"
                        onClick={() => setNewChannelAudience(aud.id as any)}
                        className={`rounded-xl py-2 text-xs font-medium border transition cursor-pointer ${
                          newChannelAudience === aud.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background/80 text-muted-foreground border-border/60 hover:text-foreground"
                        }`}
                      >
                        {aud.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Icon</label>
                  <div className="mt-1 flex gap-2">
                    {[
                      { id: "hash", icon: Hash },
                      { id: "message-square", icon: MessageSquare },
                      { id: "graduation-cap", icon: GraduationCap },
                      { id: "users", icon: Users },
                      { id: "book-open", icon: BookOpen },
                      { id: "sparkles", icon: Sparkles },
                    ].map((ic) => (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => setNewChannelIcon(ic.id)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer ${
                          newChannelIcon === ic.id
                            ? "bg-primary/20 text-primary border-primary"
                            : "bg-background/60 text-muted-foreground border-border/60 hover:text-foreground"
                        }`}
                      >
                        <ic.icon className="size-4" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setCreateChannelOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createChannelMutation.mutate()}
                  disabled={createChannelMutation.isPending || !newChannelName.trim()}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition disabled:opacity-50 cursor-pointer"
                >
                  {createChannelMutation.isPending ? "Creating…" : "Create Channel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Pick a Notebook to Share */}
        {shareNotebookOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="glass w-full max-w-lg rounded-3xl p-6 border border-border/60 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-5 text-primary" />
                  <h3 className="font-display text-lg font-bold">Share a Study Notebook</h3>
                </div>
                <button
                  onClick={() => setShareNotebookOpen(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Select one of your study kits to attach into the conversation. Other members can preview and study from your cards!
              </p>

              <div className="mt-4 max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {myNotebooks.length === 0 ? (
                  <p className="text-center py-8 text-xs text-muted-foreground">
                    You don't have any notebooks yet. Generate one in your Dashboard first!
                  </p>
                ) : (
                  myNotebooks.map((nb: any) => (
                    <div
                      key={nb.id}
                      onClick={() => attachNotebook(nb)}
                      className="group flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-3 hover:border-primary/40 hover:bg-primary/5 transition cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-[9px] font-semibold text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full">
                          {nb.subject_code || "STUDY"}
                        </span>
                        <h4 className="mt-1 text-xs font-bold text-foreground truncate">{nb.title}</h4>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{nb.flashcards_count} Cards</span>
                          <span>•</span>
                          <span>{nb.quiz_count} Quizzes</span>
                        </div>
                      </div>

                      <button className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition shrink-0">
                        Attach
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Interactive Study Kit Preview */}
        {previewKitOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="glass w-full max-w-2xl rounded-3xl p-6 border border-border/60 shadow-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  <h3 className="font-display text-lg font-bold">
                    {activePreviewKit?.notebook?.title || "Study Kit Preview"}
                  </h3>
                </div>
                <button
                  onClick={() => setPreviewKitOpen(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              {loadingKitPreview ? (
                <div className="py-16 text-center text-xs text-muted-foreground">Loading study kit…</div>
              ) : activePreviewKit ? (
                <div className="flex-1 overflow-y-auto space-y-6 pt-4 custom-scrollbar">
                  {/* Summary */}
                  {activePreviewKit.notebook?.description && (
                    <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-foreground/90">
                      <p className="font-semibold text-primary mb-1">Kit Summary</p>
                      <p>{activePreviewKit.notebook.description}</p>
                    </div>
                  )}

                  {/* Flashcards Interactive Flip */}
                  {activePreviewKit.flashcards?.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-foreground">
                          Flashcards ({activeCardIndex + 1}/{activePreviewKit.flashcards.length})
                        </p>
                        <span className="text-[10px] text-muted-foreground">Click card to flip</span>
                      </div>

                      <div
                        onClick={() => setCardFlipped(!cardFlipped)}
                        className="relative min-h-[160px] rounded-2xl border border-border/60 bg-background/80 p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-primary/40 transition shadow-sm"
                      >
                        <span className="text-[10px] font-mono text-primary uppercase mb-2">
                          {cardFlipped ? "ANSWER" : "QUESTION"}
                        </span>
                        <p className="text-sm font-medium text-foreground">
                          {cardFlipped
                            ? activePreviewKit.flashcards[activeCardIndex]?.answer
                            : activePreviewKit.flashcards[activeCardIndex]?.question}
                        </p>
                      </div>

                      <div className="flex justify-between items-center mt-3">
                        <button
                          disabled={activeCardIndex === 0}
                          onClick={() => {
                            setActiveCardIndex((prev) => Math.max(0, prev - 1));
                            setCardFlipped(false);
                          }}
                          className="rounded-xl px-3 py-1.5 text-xs font-medium border border-border/60 disabled:opacity-40 cursor-pointer"
                        >
                          Previous
                        </button>
                        <button
                          disabled={activeCardIndex >= activePreviewKit.flashcards.length - 1}
                          onClick={() => {
                            setActiveCardIndex((prev) => Math.min(activePreviewKit.flashcards.length - 1, prev + 1));
                            setCardFlipped(false);
                          }}
                          className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40 cursor-pointer"
                        >
                          Next Card
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sample Quiz Questions */}
                  {activePreviewKit.quiz?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-foreground mb-3">Quiz Questions</p>
                      <div className="space-y-3">
                        {activePreviewKit.quiz.slice(0, 3).map((q: any, i: number) => (
                          <div key={i} className="rounded-2xl border border-border/40 p-4 bg-background/50 text-xs">
                            <p className="font-medium text-foreground mb-2">
                              {i + 1}. {q.question}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                              {(q.options ?? []).map((opt: string, optIdx: number) => (
                                <div
                                  key={optIdx}
                                  className={`rounded-xl px-3 py-2 text-xs border ${
                                    optIdx === q.correct_index
                                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 font-semibold"
                                      : "bg-background/80 border-border/40 text-muted-foreground"
                                  }`}
                                >
                                  {opt}
                                </div>
                              ))}
                            </div>
                            {q.explanation && (
                              <p className="mt-2 text-[10px] text-muted-foreground italic">
                                Reason: {q.explanation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {activePreviewKit?.notebook?.id && (
                <div className="pt-3 mt-3 border-t border-border/40 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    Access all flashcards, full quiz sets, and study notes in the workspace.
                  </span>
                  <a
                    href={`/notebook/${activePreviewKit.notebook.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition cursor-pointer ml-auto"
                  >
                    <ExternalLink className="size-3.5" />
                    Open Full Study Workspace
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LIGHTBOX: Image Zoom Modal */}
        {lightboxImage && (
          <div
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 cursor-pointer"
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img
                src={lightboxImage}
                alt="Enlarged attachment"
                className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
              />
              <button
                onClick={() => setLightboxImage(null)}
                className="absolute top-3 right-3 size-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
