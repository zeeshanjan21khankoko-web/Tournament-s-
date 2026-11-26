export interface UserProfile {
  id: number;
  firebase_uid?: string;
  player_id: string;
  username: string;
  email: string;
  phone?: string;
  avatar_url: string;
  role: 'player' | 'admin';
  is_blocked: number;
  wallet_balance: number;
  matches_played: number;
  wins: number;
  kills?: number;
  points?: number;
  created_at: string;
}

export interface WalletAccount {
  user_id: number;
  available_balance: number;
  pending_withdrawal: number;
  total_deposited: number;
  total_withdrawn: number;
  total_won: number;
  updated_at: string;
}

export interface RegisteredPlayer {
  id: number;
  user_id: number;
  in_game_name: string;
  in_game_id: string;
  slot_number: number;
  status: string;
  registered_at: string;
  player_id: string;
  username: string;
  avatar_url: string;
}

export interface TournamentWinner {
  id: number;
  placement: number;
  prize_amount: number;
  declared_at: string;
  user_id: number;
  player_id: string;
  username: string;
  avatar_url: string;
}

export type TournamentMode = 'Battle Royale' | 'Clash Squad' | 'Lone Wolf';

export interface Tournament {
  id: number;
  title: string;
  game_name: string;
  mode: TournamentMode;
  entry_fee: number;
  prize_pool: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
  prize_4th: number;
  prize_5th: number;
  max_slots: number;
  filled_slots: number;
  match_time: string;
  end_time: string;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  banner_url: string;
  rules: string;
  room_id: string;
  room_pass: string;
  created_at: string;
  is_registered: boolean;
  registered_players: RegisteredPlayer[];
  winners: TournamentWinner[];
}

export interface DepositRecord {
  id: number;
  user_id?: number;
  username?: string;
  player_id?: string;
  email?: string;
  amount: number;
  method: 'jazzcash' | 'easypaisa';
  transaction_ref: string;
  sender_account: string;
  screenshot_data?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface WithdrawalRecord {
  id: number;
  user_id?: number;
  username?: string;
  player_id?: string;
  email?: string;
  amount: number;
  method: 'jazzcash' | 'easypaisa' | 'bank_account';
  bank_name?: string;
  account_title: string;
  account_number: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  admin_note: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface WinningRecord {
  id: number;
  tournament_id: number;
  tournament_title: string;
  tournament_mode: TournamentMode;
  placement: number;
  prize_amount: number;
  declared_at: string;
}

export interface TransactionRecord {
  id: number;
  tx_code: string;
  user_id?: number;
  username?: string;
  player_id?: string;
  type:
    | 'deposit'
    | 'withdrawal'
    | 'entry_fee'
    | 'prize_win'
    | 'refund'
    | 'admin_adjustment'
    | 'transfer_out'
    | 'transfer_in'
    | 'lucky_draw';
  amount: number;
  direction: 'credit' | 'debit';
  balance_after: number;
  status: 'pending' | 'approved' | 'paid' | 'completed' | 'rejected';
  reference_id: string;
  description: string;
  created_at: string;
}

export interface PaymentChannel {
  id: 'jazzcash' | 'easypaisa';
  name: string;
  accountTitle: string;
  accountNumber: string;
  providerLabel: string;
  instructions: string[];
}

export interface AdminOverview {
  totalUsers: number;
  blockedUsers: number;
  totalUserBalances: number;
  totalTournaments: number;
  activeTournaments: number;
  pendingDeposits: number;
  totalDeposited: number;
  pendingWithdrawals: number;
  totalWithdrawn: number;
  totalEntryFees: number;
  totalPrizesAwarded: number;
  pendingTeamRegistrations?: number;
  openContacts?: number;
}

export interface TeamRegistrationRecord {
  id: number;
  registration_code: string;
  tournament_id: number;
  tournament_title?: string;
  tournament_mode?: TournamentMode;
  match_time?: string;
  user_id?: number | null;
  leader_name: string;
  freefire_uid: string;
  whatsapp_number?: string;
  team_name: string;
  squad_type: 'Solo' | 'Duo' | 'Squad';
  teammates: string;
  payment_method: 'free' | 'wallet' | 'jazzcash' | 'easypaisa';
  payment_ref: string;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
}

export interface AnnouncementRecord {
  id: number;
  title: string;
  category: 'Announcement' | 'Match Result' | 'Room Alert' | 'Rules Update';
  tournament_id: number | null;
  tournament_title?: string | null;
  content: string;
  is_pinned: number;
  created_at: string;
}

export interface ContactMessageRecord {
  id: number;
  ticket_code: string;
  name: string;
  whatsapp_number: string;
  freefire_uid: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
}

export interface YouTubeVideoRecord {
  id: number;
  title: string;
  youtube_url: string;
  video_id: string;
  is_featured: number;
  created_at: string;
  updated_at: string;
}

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  player_id: string;
  username: string;
  avatar_url: string;
  points: number;
  matches: number;
  wins: number;
  kills?: number;
  losses: number;
  win_rate: number;
  first_places: number;
  second_places: number;
  third_places: number;
  fourth_places?: number;
  fifth_places?: number;
  podiums: number;
  total_prize_won: number;
}

export interface LeaderboardSummary {
  totalPlayers: number;
  totalMatches: number;
  totalWins: number;
  totalPrizesDistributed: number;
  topScore: number;
}

