/**
 * Data Models and Schemas for the Dynamic Puzzle System
 * Defines the structure and validation for all data types
 */

// === PUZZLE CATEGORIES ===
export const PUZZLE_CATEGORIES = {
  FIX_WEAKNESSES: 'fix-weaknesses',
  LEARN_MISTAKES: 'learn-mistakes', 
  MASTER_OPENINGS: 'master-openings',
  SHARPEN_ENDGAME: 'sharpen-endgame'
};

export const PUZZLE_CATEGORY_INFO = {
  [PUZZLE_CATEGORIES.FIX_WEAKNESSES]: {
    title: 'Fix My Weaknesses',
    subtitle: 'Puzzles targeting your recurring mistakes',
    description: 'Practice positions where you repeatedly make similar errors',
    color: 'red',
    icon: '🎯'
  },
  [PUZZLE_CATEGORIES.LEARN_MISTAKES]: {
    title: 'Learn From My Mistakes', 
    subtitle: 'Critical positions from recent games',
    description: 'Solve the key moments you missed in your recent games',
    color: 'orange',
    icon: '📚'
  },
  [PUZZLE_CATEGORIES.MASTER_OPENINGS]: {
    title: 'Master My Openings',
    subtitle: 'Opening theory and improvements', 
    description: 'Learn better moves in your opening repertoire',
    color: 'blue',
    icon: '📖'
  },
  [PUZZLE_CATEGORIES.SHARPEN_ENDGAME]: {
    title: 'Sharpen My Endgame',
    subtitle: 'Endgame technique and conversion',
    description: 'Master essential endgame positions and techniques',
    color: 'green',
    icon: '♔'
  }
};

// === TACTICAL THEMES ===
export const TACTICAL_THEMES = {
  // Basic tactics
  FORK: 'fork',
  PIN: 'pin', 
  SKEWER: 'skewer',
  DISCOVERED_ATTACK: 'discovered_attack',
  DOUBLE_ATTACK: 'double_attack',
  
  // Mating patterns
  MATE_IN_1: 'mate_in_1',
  MATE_IN_2: 'mate_in_2',
  MATE_IN_3: 'mate_in_3',
  BACK_RANK_MATE: 'back_rank_mate',
  SMOTHERED_MATE: 'smothered_mate',
  
  // Positional themes
  HANGING_PIECE: 'hanging_piece',
  TRAPPED_PIECE: 'trapped_piece',
  WEAK_KING: 'weak_king',
  PAWN_PROMOTION: 'pawn_promotion',
  
  // Endgame themes
  KING_AND_PAWN: 'king_and_pawn',
  ROOK_ENDGAME: 'rook_endgame',
  QUEEN_ENDGAME: 'queen_endgame',
  OPPOSITION: 'opposition',
  ZUGZWANG: 'zugzwang',
  
  // Opening themes
  OPENING_TRAP: 'opening_trap',
  DEVELOPMENT: 'development',
  CENTER_CONTROL: 'center_control',
  CASTLING_SAFETY: 'castling_safety'
};

export const THEME_INFO = {
  [TACTICAL_THEMES.FORK]: {
    name: 'Fork',
    description: 'Attack two pieces simultaneously',
    difficulty: 2,
    category: 'basic_tactics'
  },
  [TACTICAL_THEMES.PIN]: {
    name: 'Pin', 
    description: 'Restrict piece movement by attacking through it',
    difficulty: 2,
    category: 'basic_tactics'
  },
  [TACTICAL_THEMES.MATE_IN_1]: {
    name: 'Mate in 1',
    description: 'Deliver checkmate in one move',
    difficulty: 1,
    category: 'checkmate'
  },
  [TACTICAL_THEMES.HANGING_PIECE]: {
    name: 'Hanging Piece',
    description: 'Capture an undefended piece',
    difficulty: 1,
    category: 'basic_tactics'
  }
  // Add more theme info as needed
};

// === MISTAKE TYPES ===
export const MISTAKE_TYPES = {
  BLUNDER: 'blunder',           // >200cp loss
  MISTAKE: 'mistake',           // 100-200cp loss  
  INACCURACY: 'inaccuracy',     // 50-100cp loss
  MISSED_WIN: 'missed_win',     // Missed forced mate
  MISSED_TACTIC: 'missed_tactic', // Missed tactical shot
  OPENING_ERROR: 'opening_error', // Deviation from theory
  ENDGAME_ERROR: 'endgame_error', // Technical endgame mistake
  TIME_TROUBLE: 'time_trouble'    // Mistake due to time pressure
};

// === DIFFICULTY LEVELS ===
export const DIFFICULTY_LEVELS = {
  BEGINNER: 1,    // 800-1200 rating equivalent
  EASY: 2,        // 1200-1500 rating equivalent  
  MEDIUM: 3,      // 1500-1800 rating equivalent
  HARD: 4,        // 1800-2100 rating equivalent
  EXPERT: 5       // 2100+ rating equivalent
};

export const DIFFICULTY_INFO = {
  [DIFFICULTY_LEVELS.BEGINNER]: {
    name: 'Beginner',
    description: 'Simple one-move tactics',
    color: 'green',
    ratingRange: '800-1200'
  },
  [DIFFICULTY_LEVELS.EASY]: {
    name: 'Easy', 
    description: 'Basic two-move combinations',
    color: 'blue',
    ratingRange: '1200-1500'
  },
  [DIFFICULTY_LEVELS.MEDIUM]: {
    name: 'Medium',
    description: 'Multi-move tactical sequences', 
    color: 'yellow',
    ratingRange: '1500-1800'
  },
  [DIFFICULTY_LEVELS.HARD]: {
    name: 'Hard',
    description: 'Complex combinations and strategy',
    color: 'orange', 
    ratingRange: '1800-2100'
  },
  [DIFFICULTY_LEVELS.EXPERT]: {
    name: 'Expert',
    description: 'Master-level positions',
    color: 'red',
    ratingRange: '2100+'
  }
};

// === DATA SCHEMAS ===

/**
 * Puzzle Schema
 */
export class PuzzleModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.fen = data.fen || '';
    this.solution = data.solution || '';
    this.alternativeMoves = data.alternativeMoves || [];
    this.category = data.category || '';
    this.theme = data.theme || '';
    this.difficulty = data.difficulty || DIFFICULTY_LEVELS.MEDIUM;
    this.objective = data.objective || '';
    this.hint = data.hint || '';
    this.explanation = data.explanation || '';
    this.sourceGameId = data.sourceGameId || null;
    this.sourcePosition = data.sourcePosition || null;
    this.moveNumber = data.moveNumber || 0;
    this.centipawnLoss = data.centipawnLoss || 0;
    this.dateGenerated = data.dateGenerated || new Date().toISOString();
    this.timesAttempted = data.timesAttempted || 0;
    this.timesCorrect = data.timesCorrect || 0;
    this.averageTime = data.averageTime || 0;
    this.metadata = data.metadata || {};
  }

  // Validation
  isValid() {
    return this.fen && this.solution && this.category && this.objective;
  }

  // Calculate success rate
  getSuccessRate() {
    if (this.timesAttempted === 0) return 0;
    return (this.timesCorrect / this.timesAttempted) * 100;
  }

  // Get difficulty name
  getDifficultyName() {
    return DIFFICULTY_INFO[this.difficulty]?.name || 'Unknown';
  }

  // Get theme name
  getThemeName() {
    return THEME_INFO[this.theme]?.name || this.theme;
  }
}

/**
 * User Game Schema
 */
export class UserGameModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.gameId = data.gameId || data.url || `${Date.now()}_${Math.random()}`;
    this.platform = data.platform || '';
    this.username = data.username || '';
    this.pgn = data.pgn || '';
    this.moves = data.moves || '';
    this.result = data.result || '';
    this.timeControl = data.timeControl || data.time_control || '';
    this.playerColor = data.playerColor || '';
    this.opponentRating = data.opponentRating || 0;
    this.playerRating = data.playerRating || 0;
    this.accuracyData = data.accuracyData || null;
    this.analysisData = data.analysisData || null;
    this.dateAdded = data.dateAdded || new Date().toISOString();
    this.rawGameData = data.rawGameData || data;
  }

  isValid() {
    // Basic validation - we should have gameId, username, and moves
    return this.gameId && this.username && (this.pgn || this.moves);
  }

  getPlayerAccuracy() {
    if (!this.accuracyData) return null;
    // Extract player accuracy based on color
    return this.playerColor === 'white' ? 
      this.accuracyData.white?.accuracy : 
      this.accuracyData.black?.accuracy;
  }
}

/**
 * User Mistake Schema
 */
export class UserMistakeModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.username = data.username || '';
    this.mistakeType = data.mistakeType || '';
    this.description = data.description || '';
    this.fen = data.fen || '';
    this.correctMove = data.correctMove || '';
    this.playerMove = data.playerMove || '';
    this.centipawnLoss = data.centipawnLoss || 0;
    this.gameId = data.gameId || '';
    this.moveNumber = data.moveNumber || 0;
    this.frequency = data.frequency || 1;
    this.lastOccurrence = data.lastOccurrence || new Date().toISOString();
    this.category = data.category || '';
    this.theme = data.theme || '';
  }

  isValid() {
    return this.username && this.mistakeType && this.fen && this.correctMove && this.gameId;
  }

  getMistakeTypeName() {
    return this.mistakeType.replace('_', ' ').toUpperCase();
  }

  getSeverity() {
    if (this.centipawnLoss >= 200) return 'Blunder';
    if (this.centipawnLoss >= 100) return 'Mistake';
    if (this.centipawnLoss >= 50) return 'Inaccuracy';
    return 'Minor';
  }
}

/**
 * User Progress Schema
 */
export class UserProgressModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.puzzleId = data.puzzleId || null;
    this.category = data.category || '';
    this.completed = data.completed || false;
    this.correct = data.correct || false;
    this.timeSpent = data.timeSpent || 0;
    this.hintsUsed = data.hintsUsed || 0;
    this.attempts = data.attempts || 1;
    this.dateAttempted = data.dateAttempted || new Date().toISOString();
  }

  isValid() {
    return this.puzzleId && this.category;
  }
}

/**
 * Opening Deviation Schema
 */
export class OpeningDeviationModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.opening = data.opening || '';
    this.deviation_move = data.deviation_move || '';
    this.correct_move = data.correct_move || '';
    this.fen = data.fen || '';
    this.frequency = data.frequency || 1;
    this.gameIds = data.gameIds || [];
    this.lastOccurrence = data.lastOccurrence || new Date().toISOString();
  }

  isValid() {
    return this.opening && this.deviation_move && this.fen;
  }
}

// === UTILITY FUNCTIONS ===

/**
 * Calculate puzzle difficulty based on various factors
 */
export const calculatePuzzleDifficulty = (centipawnLoss, moveDepth, theme, playerRating = 1500) => {
  let difficulty = DIFFICULTY_LEVELS.MEDIUM;

  // Base difficulty on centipawn loss
  if (centipawnLoss >= 300) {
    difficulty = DIFFICULTY_LEVELS.BEGINNER;
  } else if (centipawnLoss >= 200) {
    difficulty = DIFFICULTY_LEVELS.EASY;
  } else if (centipawnLoss >= 100) {
    difficulty = DIFFICULTY_LEVELS.MEDIUM;
  } else if (centipawnLoss >= 50) {
    difficulty = DIFFICULTY_LEVELS.HARD;
  } else {
    difficulty = DIFFICULTY_LEVELS.EXPERT;
  }

  // Adjust based on theme complexity
  const themeInfo = THEME_INFO[theme];
  if (themeInfo) {
    difficulty = Math.max(1, Math.min(5, difficulty + (themeInfo.difficulty - 2)));
  }

  // Adjust based on move depth (more moves = harder)
  if (moveDepth >= 5) difficulty = Math.min(5, difficulty + 1);
  if (moveDepth >= 8) difficulty = Math.min(5, difficulty + 1);

  // Adjust based on player rating
  const ratingAdjustment = Math.floor((playerRating - 1500) / 300);
  difficulty = Math.max(1, Math.min(5, difficulty + ratingAdjustment));

  return difficulty;
};

/**
 * Determine mistake type based on centipawn loss
 */
export const classifyMistake = (centipawnLoss, isMate = false) => {
  if (isMate) return MISTAKE_TYPES.MISSED_WIN;
  if (centipawnLoss >= 200) return MISTAKE_TYPES.BLUNDER;
  if (centipawnLoss >= 100) return MISTAKE_TYPES.MISTAKE;
  if (centipawnLoss >= 50) return MISTAKE_TYPES.INACCURACY;
  return null; // Not significant enough to be a mistake
};

/**
 * Generate puzzle objective text based on theme and category
 */
export const generatePuzzleObjective = (theme, category, moveNumber, playerColor = 'white') => {
  const colorText = playerColor === 'white' ? 'White' : 'Black';
  const moveText = `${colorText} to move`;

  const themeObjectives = {
    [TACTICAL_THEMES.FORK]: `${moveText}. Find the fork that wins material.`,
    [TACTICAL_THEMES.PIN]: `${moveText}. Use a pin to win material or gain advantage.`,
    [TACTICAL_THEMES.MATE_IN_1]: `${moveText}. Deliver checkmate in one move.`,
    [TACTICAL_THEMES.MATE_IN_2]: `${moveText}. Find the forced mate in two moves.`,
    [TACTICAL_THEMES.HANGING_PIECE]: `${moveText}. Capture the undefended piece.`,
    [TACTICAL_THEMES.DEVELOPMENT]: `${moveText}. Find the best developing move.`,
    [TACTICAL_THEMES.CENTER_CONTROL]: `${moveText}. Improve your central control.`
  };

  return themeObjectives[theme] || `${moveText}. Find the best move in this position.`;
};

export default {
  PUZZLE_CATEGORIES,
  PUZZLE_CATEGORY_INFO,
  TACTICAL_THEMES,
  THEME_INFO,
  MISTAKE_TYPES,
  DIFFICULTY_LEVELS,
  DIFFICULTY_INFO,
  PuzzleModel,
  UserGameModel,
  UserMistakeModel,
  UserProgressModel,
  OpeningDeviationModel,
  calculatePuzzleDifficulty,
  classifyMistake,
  generatePuzzleObjective
};