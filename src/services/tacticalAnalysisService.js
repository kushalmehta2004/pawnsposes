/**
 * Tactical Analysis Service
 * Identifies tactical patterns and motifs in chess positions
 * Supports puzzle generation with tactical themes
 */

import { Chess } from 'chess.js';
import { TACTICAL_THEMES } from '../utils/dataModels.js';

class TacticalAnalysisService {
  constructor() {
    this.patternCache = new Map();
  }

  /**
   * Analyze position for tactical motifs
   */
  analyzeTacticalMotifs(fen, bestMove = null, analysis = null) {
    const chess = new Chess(fen);
    const motifs = [];

    // Basic tactical pattern detection
    const patterns = [
      this.detectForks(chess),
      this.detectPins(chess),
      this.detectSkewers(chess),
      this.detectHangingPieces(chess),
      this.detectMateThreats(chess, analysis),
      this.detectDiscoveredAttacks(chess),
      this.detectTrappedPieces(chess)
    ];

    // Flatten and filter valid patterns
    for (const patternGroup of patterns) {
      if (Array.isArray(patternGroup)) {
        motifs.push(...patternGroup);
      } else if (patternGroup) {
        motifs.push(patternGroup);
      }
    }

    // If we have a best move, check if it executes any of these tactics
    if (bestMove) {
      const executedTactic = this.identifyTacticInMove(chess, bestMove, motifs);
      if (executedTactic) {
        return executedTactic;
      }
    }

    // Return the most significant motif found
    return motifs.length > 0 ? motifs[0] : { theme: TACTICAL_THEMES.HANGING_PIECE, confidence: 0.5 };
  }

  /**
   * Detect fork patterns
   */
  detectForks(chess) {
    const forks = [];
    const moves = chess.moves({ verbose: true });

    for (const move of moves) {
      const tempChess = new Chess(chess.fen());
      tempChess.move(move);

      // Check if this move attacks multiple pieces
      const attackedSquares = this.getAttackedSquares(tempChess, move.to);
      const attackedPieces = attackedSquares.filter(square => {
        const piece = tempChess.get(square);
        return piece && piece.color !== tempChess.turn();
      });

      if (attackedPieces.length >= 2) {
        // Check if the attacked pieces are valuable
        const values = attackedPieces.map(square => this.getPieceValue(tempChess.get(square)));
        const totalValue = values.reduce((sum, val) => sum + val, 0);

        if (totalValue >= 8) { // At least a rook's worth
          forks.push({
            theme: TACTICAL_THEMES.FORK,
            move: move.san,
            confidence: Math.min(0.9, totalValue / 15),
            details: {
              attackedPieces: attackedPieces.length,
              totalValue: totalValue,
              forkingPiece: move.piece
            }
          });
        }
      }
    }

    return forks.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect pin patterns
   */
  detectPins(chess) {
    const pins = [];
    const moves = chess.moves({ verbose: true });

    for (const move of moves) {
      // Check for pins along ranks, files, and diagonals
      if (move.piece === 'r' || move.piece === 'q') {
        const pin = this.checkForPin(chess, move, ['rank', 'file']);
        if (pin) pins.push(pin);
      }
      
      if (move.piece === 'b' || move.piece === 'q') {
        const pin = this.checkForPin(chess, move, ['diagonal']);
        if (pin) pins.push(pin);
      }
    }

    return pins.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check for pin along specified directions
   */
  checkForPin(chess, move, directions) {
    const tempChess = new Chess(chess.fen());
    tempChess.move(move);

    // This is a simplified pin detection
    // A full implementation would check all directions properly
    const attackedSquares = this.getAttackedSquares(tempChess, move.to);
    
    for (const square of attackedSquares) {
      const piece = tempChess.get(square);
      if (piece && piece.color !== tempChess.turn()) {
        // Check if there's a more valuable piece behind this one
        const behindSquares = this.getSquaresBehind(square, move.to);
        for (const behindSquare of behindSquares) {
          const behindPiece = tempChess.get(behindSquare);
          if (behindPiece && behindPiece.color === piece.color && 
              this.getPieceValue(behindPiece) > this.getPieceValue(piece)) {
            return {
              theme: TACTICAL_THEMES.PIN,
              move: move.san,
              confidence: 0.8,
              details: {
                pinnedPiece: piece.type,
                targetPiece: behindPiece.type,
                pinningPiece: move.piece
              }
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Detect skewer patterns
   */
  detectSkewers(chess) {
    // Similar to pins but the valuable piece is in front
    const skewers = [];
    const moves = chess.moves({ verbose: true });

    for (const move of moves) {
      if (move.piece === 'r' || move.piece === 'q' || move.piece === 'b') {
        const skewer = this.checkForSkewer(chess, move);
        if (skewer) skewers.push(skewer);
      }
    }

    return skewers.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check for skewer pattern
   */
  checkForSkewer(chess, move) {
    // Simplified skewer detection
    const tempChess = new Chess(chess.fen());
    tempChess.move(move);

    const attackedSquares = this.getAttackedSquares(tempChess, move.to);
    
    for (const square of attackedSquares) {
      const piece = tempChess.get(square);
      if (piece && piece.color !== tempChess.turn() && this.getPieceValue(piece) >= 5) {
        // Check if there's a less valuable piece behind
        const behindSquares = this.getSquaresBehind(square, move.to);
        for (const behindSquare of behindSquares) {
          const behindPiece = tempChess.get(behindSquare);
          if (behindPiece && behindPiece.color === piece.color && 
              this.getPieceValue(behindPiece) < this.getPieceValue(piece)) {
            return {
              theme: TACTICAL_THEMES.SKEWER,
              move: move.san,
              confidence: 0.8,
              details: {
                frontPiece: piece.type,
                backPiece: behindPiece.type,
                attackingPiece: move.piece
              }
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Detect hanging pieces
   */
  detectHangingPieces(chess) {
    const hangingPieces = [];
    const opponentColor = chess.turn() === 'w' ? 'b' : 'w';

    // Get all opponent pieces
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === opponentColor) {
          const square = String.fromCharCode(97 + file) + (8 - rank);
          
          if (this.isPieceHanging(chess, square, piece)) {
            hangingPieces.push({
              theme: TACTICAL_THEMES.HANGING_PIECE,
              square: square,
              piece: piece.type,
              confidence: 0.9,
              details: {
                pieceValue: this.getPieceValue(piece),
                canCapture: true
              }
            });
          }
        }
      }
    }

    return hangingPieces.sort((a, b) => b.details.pieceValue - a.details.pieceValue);
  }

  /**
   * Check if a piece is hanging (undefended)
   */
  isPieceHanging(chess, square, piece) {
    // Check if we can capture this piece
    const moves = chess.moves({ verbose: true });
    const capturingMoves = moves.filter(move => move.to === square && move.captured);
    
    if (capturingMoves.length === 0) return false;

    // Check if the piece is defended
    const tempChess = new Chess(chess.fen());
    const defendingMoves = tempChess.moves({ verbose: true }).filter(move => 
      move.to === square && !move.captured
    );

    // Simple check: if we can capture and it's not defended by a less valuable piece
    if (capturingMoves.length > 0) {
      const capturingPieceValue = this.getPieceValue({ type: capturingMoves[0].piece });
      const targetPieceValue = this.getPieceValue(piece);
      
      // If we can capture with a less valuable piece, it's likely hanging
      return capturingPieceValue < targetPieceValue;
    }

    return false;
  }

  /**
   * Detect mate threats
   */
  detectMateThreats(chess, analysis = null) {
    const mateThreats = [];

    // If we have engine analysis, use it
    if (analysis && analysis.evaluation && analysis.evaluation.type === 'mate') {
      const mateIn = Math.abs(analysis.evaluation.value);
      let theme = TACTICAL_THEMES.MATE_IN_1;
      
      if (mateIn === 2) theme = TACTICAL_THEMES.MATE_IN_2;
      else if (mateIn === 3) theme = TACTICAL_THEMES.MATE_IN_3;
      
      return {
        theme: theme,
        move: analysis.bestMove,
        confidence: 0.95,
        details: {
          mateIn: mateIn,
          forced: true
        }
      };
    }

    // Basic mate detection
    const moves = chess.moves({ verbose: true });
    for (const move of moves) {
      const tempChess = new Chess(chess.fen());
      tempChess.move(move);
      
      if (tempChess.isCheckmate()) {
        mateThreats.push({
          theme: TACTICAL_THEMES.MATE_IN_1,
          move: move.san,
          confidence: 1.0,
          details: {
            mateIn: 1,
            checkmate: true
          }
        });
      }
    }

    return mateThreats;
  }

  /**
   * Detect discovered attacks
   */
  detectDiscoveredAttacks(chess) {
    const discoveredAttacks = [];
    const moves = chess.moves({ verbose: true });

    for (const move of moves) {
      // Check if moving this piece reveals an attack from another piece
      const tempChess = new Chess(chess.fen());
      const originalAttacks = this.getAllAttacks(chess);
      
      tempChess.move(move);
      const newAttacks = this.getAllAttacks(tempChess);

      // Compare attacks to find new ones
      const discoveredTargets = newAttacks.filter(attack => 
        !originalAttacks.some(orig => orig.from === attack.from && orig.to === attack.to)
      );

      if (discoveredTargets.length > 0) {
        const valuableTargets = discoveredTargets.filter(target => {
          const piece = tempChess.get(target.to);
          return piece && this.getPieceValue(piece) >= 3;
        });

        if (valuableTargets.length > 0) {
          discoveredAttacks.push({
            theme: TACTICAL_THEMES.DISCOVERED_ATTACK,
            move: move.san,
            confidence: 0.8,
            details: {
              movingPiece: move.piece,
              revealedAttacks: valuableTargets.length
            }
          });
        }
      }
    }

    return discoveredAttacks.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect trapped pieces
   */
  detectTrappedPieces(chess) {
    const trappedPieces = [];
    const opponentColor = chess.turn() === 'w' ? 'b' : 'w';

    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === opponentColor && this.getPieceValue(piece) >= 3) {
          const square = String.fromCharCode(97 + file) + (8 - rank);
          
          if (this.isPieceTrapped(chess, square, piece)) {
            trappedPieces.push({
              theme: TACTICAL_THEMES.TRAPPED_PIECE,
              square: square,
              piece: piece.type,
              confidence: 0.8,
              details: {
                pieceValue: this.getPieceValue(piece),
                escapeMoves: this.countEscapeMoves(chess, square)
              }
            });
          }
        }
      }
    }

    return trappedPieces.sort((a, b) => b.details.pieceValue - a.details.pieceValue);
  }

  /**
   * Check if a piece is trapped
   */
  isPieceTrapped(chess, square, piece) {
    // Create a temporary position with the opponent to move
    const tempChess = new Chess(chess.fen());
    
    // Switch turns to check opponent's moves
    const currentFen = tempChess.fen();
    const fenParts = currentFen.split(' ');
    fenParts[1] = piece.color; // Set turn to piece's color
    const modifiedFen = fenParts.join(' ');
    
    try {
      const pieceChess = new Chess(modifiedFen);
      const moves = pieceChess.moves({ verbose: true, square: square });
      
      // If the piece has very few moves and they're all to attacked squares, it's trapped
      if (moves.length <= 2) {
        const safeMoves = moves.filter(move => !this.isSquareAttacked(tempChess, move.to, chess.turn()));
        return safeMoves.length === 0;
      }
    } catch (error) {
      // If FEN manipulation fails, assume not trapped
      return false;
    }

    return false;
  }

  /**
   * Count escape moves for a piece
   */
  countEscapeMoves(chess, square) {
    const piece = chess.get(square);
    if (!piece) return 0;

    const tempChess = new Chess(chess.fen());
    const moves = tempChess.moves({ verbose: true, square: square });
    
    return moves.filter(move => !this.isSquareAttacked(tempChess, move.to, chess.turn())).length;
  }

  /**
   * Identify which tactic is executed by a specific move
   */
  identifyTacticInMove(chess, bestMove, availableMotifs) {
    const tempChess = new Chess(chess.fen());
    const move = tempChess.move(bestMove);
    
    if (!move) return null;

    // Check what the move accomplishes
    if (move.captured) {
      // Direct capture - check if it's a hanging piece
      return { theme: TACTICAL_THEMES.HANGING_PIECE, confidence: 0.9 };
    }

    if (tempChess.isCheckmate()) {
      return { theme: TACTICAL_THEMES.MATE_IN_1, confidence: 1.0 };
    }

    if (tempChess.isCheck()) {
      return { theme: TACTICAL_THEMES.MATE_IN_2, confidence: 0.7 };
    }

    // Check if the move creates any of the available motifs
    for (const motif of availableMotifs) {
      if (motif.move === move.san) {
        return motif;
      }
    }

    // Default to positional move
    return { theme: TACTICAL_THEMES.DEVELOPMENT, confidence: 0.5 };
  }

  // === HELPER METHODS ===

  /**
   * Get piece value
   */
  getPieceValue(piece) {
    const values = {
      'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0
    };
    return values[piece.type] || 0;
  }

  /**
   * Get squares attacked by a piece
   */
  getAttackedSquares(chess, square) {
    const piece = chess.get(square);
    if (!piece) return [];

    const moves = chess.moves({ verbose: true, square: square });
    return moves.map(move => move.to);
  }

  /**
   * Get squares behind a target square from attacker's perspective
   */
  getSquaresBehind(targetSquare, attackerSquare) {
    // Simplified - would need proper ray calculation
    const target = this.squareToCoords(targetSquare);
    const attacker = this.squareToCoords(attackerSquare);
    
    const deltaFile = target.file - attacker.file;
    const deltaRank = target.rank - attacker.rank;
    
    const squares = [];
    let file = target.file + Math.sign(deltaFile);
    let rank = target.rank + Math.sign(deltaRank);
    
    while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
      squares.push(this.coordsToSquare(file, rank));
      file += Math.sign(deltaFile);
      rank += Math.sign(deltaRank);
    }
    
    return squares;
  }

  /**
   * Get all attacks in current position
   */
  getAllAttacks(chess) {
    const attacks = [];
    const moves = chess.moves({ verbose: true });
    
    for (const move of moves) {
      if (move.captured || chess.isAttacked(move.to, chess.turn())) {
        attacks.push({
          from: move.from,
          to: move.to,
          piece: move.piece
        });
      }
    }
    
    return attacks;
  }

  /**
   * Check if square is attacked by color
   */
  isSquareAttacked(chess, square, byColor) {
    return chess.isAttacked(square, byColor);
  }

  /**
   * Convert square notation to coordinates
   */
  squareToCoords(square) {
    return {
      file: square.charCodeAt(0) - 97,
      rank: parseInt(square[1]) - 1
    };
  }

  /**
   * Convert coordinates to square notation
   */
  coordsToSquare(file, rank) {
    return String.fromCharCode(97 + file) + (rank + 1);
  }
}

// Create singleton instance
const tacticalAnalysisService = new TacticalAnalysisService();

export default tacticalAnalysisService;
export { tacticalAnalysisService };