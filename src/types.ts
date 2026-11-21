export interface UserProfile {
  id: number;
  player_id: string;
  username: string;
  email: string;
  avatar_url: string;
  role: 'player' | 'admin';
  is_blocked: number;
  wallet_balance: number;
  matches_played: number;
  wins: number;
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

export interface Tournament {
  id: number;
  title: string;
  game_name: string;
  entry_fee: number;
  prize_pool: number;
  max_slots: number;
  filled_slots: number;
  match_time: string;
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
  method: 'jazzcash' | 'easypaisa';
  account_title: string;
  account_number: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface TransactionRecord {
  id: number;
  tx_code: string;
  user_id?: number;
  username?: string;
  player_id?: string;
  type: 'deposit' | 'withdrawal' | 'entry_fee' | 'prize_win' | 'refund' | 'admin_adjustment';
  amount: number;
  direction: 'credit' | 'debit';
  balance_after: number;
  status: 'pending' | 'completed' | 'rejected';
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
}
