import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';

/**
 * Interactive Chessboard with smooth piece movement
 * - FEN input, legal moves highlighting, basic move handling
 * - Orientation (white/black), last-move highlight, coordinates on all sides
 * - Smooth transitions for piece movement using an overlay with CSS transforms
 */
const Chessboard = ({
  position,              // FEN string
  orientation = 'white', // 'white' | 'black'
  onMove,                // callback({ from, to, san, fen }) when a legal move is made
  highlightedSquares = [],
  lastMove = null,
  showCoordinates = true
}) => {
  // Internal chess engine for legal moves and updates
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [localFen, setLocalFen] = useState(position);

  // Reset local state when external position changes
  useEffect(() => {
    setLocalFen(position);
    setSelectedSquare(null);
    setLegalTargets([]);
  }, [position]);

  const chess = useMemo(() => {
    try {
      return new Chess(localFen);
    } catch {
      return new Chess();
    }
  }, [localFen]);

  // Piece image set (cburnett via lichess CDN; visually close to chess.com style)
  const pieceSrcFor = (code) => {
    if (!code) return null;
    const isWhite = code === code.toUpperCase();
    const side = isWhite ? 'w' : 'b';
    const type = code.toUpperCase(); // K Q R B N P
    return `https://lichess1.org/assets/piece/cburnett/${side}${type}.svg`;
  };

  // Build 8x8 array of pieces from FEN using chess.js board()
  const board = useMemo(() => {
    const b = chess.board(); // array[8][8] from rank 8 to 1, files a to h
    return b.map(row => row.map(cell => (cell ? (cell.color === 'w' ? cell.type.toUpperCase() : cell.type) : null)));
  }, [chess]);

  const filesWhite = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const filesBlack = [...filesWhite].reverse();
  const ranksWhite = [8, 7, 6, 5, 4, 3, 2, 1];
  const ranksBlack = [...ranksWhite].reverse();

  const files = orientation === 'white' ? filesWhite : filesBlack;
  const ranks = orientation === 'white' ? ranksWhite : ranksBlack;

  const boardDisplay = orientation === 'white' ? board : [...board].reverse().map(r => [...r].reverse());

  const squareFromRowCol = (row, col) => {
    const file = files[col];
    const rank = ranks[row];
    return `${file}${rank}`;
  };

  const isSquareLight = (row, col) => (row + col) % 2 === 0;

  const isHighlighted = (square) => highlightedSquares.includes(square);

  const getSquareColor = (row, col) => {
    const square = squareFromRowCol(row, col);

    // Selection highlight (chesscom-ish)
    if (selectedSquare === square) return '#baca44';
    // Custom external highlight
    if (isHighlighted(square)) return '#adc5e2';
    // Last move highlight
    if (lastMove && (lastMove.from === square || lastMove.to === square)) return '#f7f769';

    // Base board colors (chess.com style)
    return isSquareLight(row, col) ? '#eeeed2' : '#769656';
  };

  const onSquareClick = (row, col) => {
    const square = squareFromRowCol(row, col);

    // If selecting own piece, show legal moves
    const piece = chess.get(square);
    if (!selectedSquare) {
      if (piece && piece.color === chess.turn()) {
        setSelectedSquare(square);
        const legal = chess.moves({ square, verbose: true }).map(m => m.to);
        setLegalTargets(legal);
      } else {
        // Clicked empty or opponent piece without selection: clear highlights
        setSelectedSquare(null);
        setLegalTargets([]);
      }
      return;
    }

    // If target not a legal move, clear selection and legal targets
    if (!legalTargets.includes(square)) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }

    // Attempt move from selectedSquare -> square (guard against exceptions)
    try {
      const move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
      if (move) {
        const newFen = chess.fen();
        setLocalFen(newFen);
        setSelectedSquare(null);
        setLegalTargets([]);
        if (onMove) onMove({ from: move.from, to: move.to, san: move.san, fen: newFen });
      } else {
        setSelectedSquare(null);
        setLegalTargets([]);
      }
    } catch (e) {
      // Invalid move from chess.js – just clear selection, keep board interactive
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  };

  // ===== Smooth piece movement overlay =====
  const SQUARE_SIZE = 56; // px, must match boardGridStyle squares
  const PIECE_SIZE = 46;  // px, must match pieceImgStyle
  const PIECE_OFFSET = (SQUARE_SIZE - PIECE_SIZE) / 2; // center piece in square

  const prevPiecesRef = useRef([]); // [{ id, type, color, square }]
  const idCounterRef = useRef(0);
  const prevOrientationRef = useRef(orientation);

  // If orientation flips between renders, suppress transitions for that frame
  const suppressTransitions = prevOrientationRef.current !== orientation;
  useEffect(() => {
    prevOrientationRef.current = orientation;
  }, [orientation]);

  // Helpers
  const squareToFileRankIndex = (sq) => {
    const file = sq.charCodeAt(0) - 'a'.charCodeAt(0); // 0..7
    const rank = parseInt(sq[1], 10) - 1; // 0..7 where 0 = rank 1
    return { file, rank };
  };

  const squareToXY = (sq) => {
    const { file, rank } = squareToFileRankIndex(sq);
    if (orientation === 'white') {
      return {
        x: file * SQUARE_SIZE + PIECE_OFFSET,
        y: (7 - rank) * SQUARE_SIZE + PIECE_OFFSET,
      };
    } else {
      return {
        x: (7 - file) * SQUARE_SIZE + PIECE_OFFSET,
        y: rank * SQUARE_SIZE + PIECE_OFFSET,
      };
    }
  };

  // Extract current pieces from chess.js (orientation-agnostic, uses logical squares)
  const currentPiecesRaw = useMemo(() => {
    const out = [];
    const ranksArr = [8,7,6,5,4,3,2,1];
    const filesArr = ['a','b','c','d','e','f','g','h'];
    for (let r of ranksArr) {
      for (let f of filesArr) {
        const sq = `${f}${r}`;
        const piece = chess.get(sq);
        if (piece) {
          out.push({ type: piece.type.toUpperCase(), color: piece.color, square: sq });
        }
      }
    }
    return out;
  }, [chess]);

  // Match current pieces to previous pieces to keep stable IDs across moves
  const currentPiecesWithIds = useMemo(() => {
    const prev = [...prevPiecesRef.current];
    const usedPrev = new Set();

    const distance = (a, b) => {
      const A = squareToFileRankIndex(a);
      const B = squareToFileRankIndex(b);
      return Math.abs(A.file - B.file) + Math.abs(A.rank - B.rank);
    };

    const assignId = (cur) => {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < prev.length; i++) {
        if (usedPrev.has(i)) continue;
        const p = prev[i];
        if (p.type === cur.type && p.color === cur.color) {
          const d = distance(p.square, cur.square);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
      }
      if (bestIdx !== -1) {
        usedPrev.add(bestIdx);
        const chosen = prev[bestIdx];
        return { ...cur, id: chosen.id };
      }
      // New piece (promotion or first render)
      idCounterRef.current += 1;
      return { ...cur, id: `${cur.color}${cur.type}-${idCounterRef.current}` };
    };

    const mapped = currentPiecesRaw.map(assignId);
    // Persist for next render
    prevPiecesRef.current = mapped.map(p => ({ id: p.id, type: p.type, color: p.color, square: p.square }));
    return mapped;
  }, [currentPiecesRaw]);

  // Styles
  const containerStyle = {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem'
  };

  const chessboardStyle = {
    display: 'flex', flexDirection: 'column', borderRadius: '6px'
  };

  const filesStyle = { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0', padding: '0 8px' };
  const fileLabelStyle = { textAlign: 'center', fontWeight: 600, color: '#444', fontSize: '0.8rem', padding: '2px 0', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' };

  const boardWithRanksStyle = { display: 'flex', alignItems: 'center' };
  const ranksStyle = { display: 'flex', flexDirection: 'column', width: '20px' };
  const rankLabelStyle = { height: `${SQUARE_SIZE}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#444', fontSize: '0.8rem', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' };

  const boardGridStyle = { display: 'grid', gridTemplateColumns: `repeat(8, ${SQUARE_SIZE}px)`, gridTemplateRows: `repeat(8, ${SQUARE_SIZE}px)`, gap: '0', position: 'relative' };

  const squareBaseStyle = { width: `${SQUARE_SIZE}px`, height: `${SQUARE_SIZE}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' };

  const overlayStyle = {
    position: 'absolute', top: 0, left: 0, width: `${SQUARE_SIZE * 8}px`, height: `${SQUARE_SIZE * 8}px`, pointerEvents: 'none'
  };

  const pieceImgBaseStyle = { width: `${PIECE_SIZE}px`, height: `${PIECE_SIZE}px`, userSelect: 'none', pointerEvents: 'none' };

  const filesTop = showCoordinates ? files : [];
  const ranksLeft = showCoordinates ? ranks : [];
  const ranksRight = showCoordinates ? ranks : [];
  const filesBottom = showCoordinates ? files : [];

  return (
    <div style={containerStyle}>
      <div style={chessboardStyle}>
        <div style={boardGridStyle}>
          {/* Squares grid (clickable) */}
          {boardDisplay.map((row, rowIndex) => (
            row.map((piece, colIndex) => {
              const bg = getSquareColor(rowIndex, colIndex);
              const square = squareFromRowCol(rowIndex, colIndex);
              const light = isSquareLight(rowIndex, colIndex);
              const coordColor = light ? '#222' : '#f0f0f0';
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  style={{ ...squareBaseStyle, backgroundColor: bg, cursor: 'pointer' }}
                  onClick={() => onSquareClick(rowIndex, colIndex)}
                >
                  {/* Rank label on leftmost file */}
                  {showCoordinates && colIndex === 0 && (
                    <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 600, color: coordColor }}>
                      {ranks[rowIndex]}
                    </span>
                  )}
                  {/* File label on bottom row */}
                  {showCoordinates && rowIndex === 7 && (
                    <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, fontWeight: 600, color: coordColor }}>
                      {files[colIndex]}
                    </span>
                  )}

                  {/* Legal move dots (lichess-like) */}
                  {selectedSquare && legalTargets.includes(square) && (
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.25)' }} />
                  )}
                </div>
              );
            })
          ))}

          {/* Animated pieces overlay */}
          <div style={overlayStyle}>
            {currentPiecesWithIds.map(p => {
              const code = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
              const { x, y } = squareToXY(p.square);
              const pieceStyle = {
                ...pieceImgBaseStyle,
                position: 'absolute',
                transform: `translate(${x}px, ${y}px)`,
                transition: suppressTransitions ? 'none' : 'transform 220ms ease',
              };
              return (
                <img key={p.id} src={pieceSrcFor(code)} alt={code} style={pieceStyle} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chessboard;