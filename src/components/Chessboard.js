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
  showCoordinates = true,
  enableArrows = true,   // enable right-click drawing
  preserveDrawingsOnPositionChange = false, // keep drawings when position updates
  onDrawChange,          // optional callback({ arrows, circles })
  moveResult = null,     // { square, isCorrect } - shows checkmark/X on destination square
  disabled = false,      // disable all interactions when true
  isStepback = false     // smooth animation when pieces step back (auto-undo)
}) => {
  // Internal chess engine for legal moves and updates
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [localFen, setLocalFen] = useState(position);
  const [animatingStepback, setAnimatingStepback] = useState(false);
  const stepbackTimeoutRef = useRef(null);

  // Reset local state when external position changes
  useEffect(() => {
    setLocalFen(position);
    setSelectedSquare(null);
    setLegalTargets([]);
  }, [position]);

  // Handle stepback animation
  useEffect(() => {
    if (isStepback) {
      setAnimatingStepback(true);
      // Clear the stepback flag after animation completes (800ms)
      if (stepbackTimeoutRef.current) {
        clearTimeout(stepbackTimeoutRef.current);
      }
      stepbackTimeoutRef.current = setTimeout(() => {
        setAnimatingStepback(false);
      }, 800);
    }
    return () => {
      if (stepbackTimeoutRef.current) {
        clearTimeout(stepbackTimeoutRef.current);
      }
    };
  }, [isStepback]);

  // Arrow/circle drawing state
  const [drawnArrows, setDrawnArrows] = useState([]); // [{ from, to, color }]
  const [drawnCircles, setDrawnCircles] = useState([]); // [{ square, color }]
  const [dragStartSq, setDragStartSq] = useState(null);
  const [dragCurSq, setDragCurSq] = useState(null);
  const [dragColor, setDragColor] = useState('green');
  const boardGridRef = useRef(null);

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
    // Prevent any moves if disabled
    if (disabled) return;

    const square = squareFromRowCol(row, col);

    // Clear any drawn arrows and circles on left-click
    setDrawnArrows([]);
    setDrawnCircles([]);
    if (onDrawChange) onDrawChange({ arrows: [], circles: [] });

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

  // ===== Responsive sizing (fits mobile, unchanged on desktop) =====
  const wrapperRef = useRef(null);
  const [squareSize, setSquareSize] = useState(56); // px per square (max 56)
  const [pieceSize, setPieceSize] = useState(52);   // px per piece (tracks square size)
  const [isDesktop, setIsDesktop] = useState(false); // viewport breakpoint tracking

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    handler(); // set initial
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth || 0;
      // Fit 8 columns into available width with desktop cap; keep mobile untouched
      const desktopCap = isDesktop ? 64 : 72; // 8x64=512 on desktop; mobile can go up to 72 for compact tablets
      const target = Math.min(desktopCap, width / 8);
      const s = Math.max(28, target); // reasonable minimum for small phones
      const p = Math.max(24, s - 4);
      setSquareSize(s);
      setPieceSize(p);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PIECE_OFFSET = (squareSize - pieceSize) / 2; // center piece in square

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
        x: file * squareSize + PIECE_OFFSET,
        y: (7 - rank) * squareSize + PIECE_OFFSET,
      };
    } else {
      return {
        x: (7 - file) * squareSize + PIECE_OFFSET,
        y: rank * squareSize + PIECE_OFFSET,
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
  // Uses optimal bipartite matching to prevent piece ID swapping with multiple identical pieces
  const currentPiecesWithIds = useMemo(() => {
    const prev = [...prevPiecesRef.current];
    const usedPrev = new Set();

    const distance = (a, b) => {
      const A = squareToFileRankIndex(a);
      const B = squareToFileRankIndex(b);
      return Math.abs(A.file - B.file) + Math.abs(A.rank - B.rank);
    };

    // Build cost matrix for optimal matching
    // For each current piece, calculate distance to all previous pieces of same type/color
    const getCostMatrix = () => {
      const costs = currentPiecesRaw.map((cur) => {
        return prev.map((p, idx) => {
          // Impossible match (different type or color)
          if (p.type !== cur.type || p.color !== cur.color) {
            return Infinity;
          }
          // Cost is distance, with strong preference for pieces that haven't moved
          const d = distance(p.square, cur.square);
          // Stationary pieces (distance 0) get cost 0, moved pieces scale linearly
          // This ensures pieces that don't move stay put
          return d === 0 ? 0 : d;
        });
      });
      return costs;
    };

    // Hungarian algorithm-like optimal assignment (simplified greedy with global view)
    // Prioritize assignments for pieces that haven't moved (distance 0)
    const assignOptimal = (costs) => {
      const assignment = new Array(currentPiecesRaw.length).fill(-1);
      
      // First pass: assign all pieces with distance 0 (stationary pieces)
      for (let cur = 0; cur < costs.length; cur++) {
        for (let p = 0; p < costs[cur].length; p++) {
          if (!usedPrev.has(p) && costs[cur][p] === 0) {
            assignment[cur] = p;
            usedPrev.add(p);
            break;
          }
        }
      }
      
      // Second pass: assign remaining pieces by minimum cost
      for (let cur = 0; cur < costs.length; cur++) {
        if (assignment[cur] !== -1) continue; // Already assigned
        
        let bestIdx = -1;
        let bestCost = Infinity;
        for (let p = 0; p < costs[cur].length; p++) {
          if (!usedPrev.has(p) && costs[cur][p] < bestCost) {
            bestCost = costs[cur][p];
            bestIdx = p;
          }
        }
        
        if (bestIdx !== -1) {
          assignment[cur] = bestIdx;
          usedPrev.add(bestIdx);
        }
      }
      
      return assignment;
    };

    const costs = getCostMatrix();
    const assignment = assignOptimal(costs);

    const mapped = currentPiecesRaw.map((cur, idx) => {
      const prevIdx = assignment[idx];
      if (prevIdx !== -1) {
        const chosen = prev[prevIdx];
        return { ...cur, id: chosen.id };
      }
      // New piece (promotion or first render)
      idCounterRef.current += 1;
      return { ...cur, id: `${cur.color}${cur.type}-${idCounterRef.current}` };
    });

    // Persist for next render
    prevPiecesRef.current = mapped.map(p => ({ id: p.id, type: p.type, color: p.color, square: p.square }));
    return mapped;
  }, [currentPiecesRaw]);

  // Styles
  const containerStyle = {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem 0',
    width: '100%', maxWidth: '100%', minWidth: 0
  };

  const chessboardStyle = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '6px',
    padding: 0,
    margin: '0 auto',
    // On desktop, make wrapper fit the board width exactly (no internal right space)
    // On mobile/tablet, keep fluid width
    width: isDesktop ? `${squareSize * 8}px` : '100%',
    maxWidth: isDesktop ? `${squareSize * 8}px` : '100%'
  }), [isDesktop, squareSize]);

  const filesStyle = { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0', padding: '0' };
  const fileLabelStyle = { textAlign: 'center', fontWeight: 600, color: '#444', fontSize: '0.8rem', padding: '2px 0', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' };

  const boardWithRanksStyle = { display: 'flex', alignItems: 'center' };
  const ranksStyle = { display: 'flex', flexDirection: 'column', width: '20px' };
  const rankLabelStyle = { height: `${squareSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#444', fontSize: '0.8rem', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' };

  const boardGridStyle = { display: 'grid', gridTemplateColumns: `repeat(8, ${squareSize}px)`, gridTemplateRows: `repeat(8, ${squareSize}px)`, gap: '0', position: 'relative', borderRadius: '6px', overflow: 'hidden' };

  // Helpers for drawing color from modifiers (Lichess-like)
  const colorFromEvent = (e) => {
    // Default green; Shift=red, Alt=blue, Shift+Alt=yellow
    const shift = e.shiftKey;
    const alt = e.altKey;
    if (shift && alt) return 'yellow';
    if (shift) return 'red';
    if (alt) return 'blue';
    return 'green';
  };

  // Map pointer coordinates to board square
  const pointToSquare = (clientX, clientY) => {
    const el = boardGridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const col = Math.min(7, Math.max(0, Math.floor(x / squareSize)));
    const row = Math.min(7, Math.max(0, Math.floor(y / squareSize)));
    // Convert row/col back to logical square (respects orientation)
    return squareFromRowCol(row, col);
  };

  // Toggle helpers
  const toggleArrow = (from, to, color) => {
    const key = `${from}-${to}-${color}`;
    const exists = drawnArrows.some(a => `${a.from}-${a.to}-${a.color}` === key);
    const next = exists ? drawnArrows.filter(a => `${a.from}-${a.to}-${a.color}` !== key) : [...drawnArrows, { from, to, color }];
    setDrawnArrows(next);
    if (onDrawChange) onDrawChange({ arrows: next, circles: drawnCircles });
  };
  const toggleCircle = (square, color) => {
    const key = `${square}-${color}`;
    const exists = drawnCircles.some(c => `${c.square}-${c.color}` === key);
    const next = exists ? drawnCircles.filter(c => `${c.square}-${c.color}` !== key) : [...drawnCircles, { square, color }];
    setDrawnCircles(next);
    if (onDrawChange) onDrawChange({ arrows: drawnArrows, circles: next });
  };

  // Pointer handlers for right-click drawing
  const onPointerDownBoard = (e) => {
    if (!enableArrows || disabled) return;
    if (e.button !== 2) return; // right button only
    e.preventDefault();
    const sq = pointToSquare(e.clientX, e.clientY);
    if (!sq) return;
    setDragColor(colorFromEvent(e));
    setDragStartSq(sq);
    setDragCurSq(sq);
  };
  const onPointerMoveBoard = (e) => {
    if (!enableArrows) return;
    if (dragStartSq == null) return;
    const sq = pointToSquare(e.clientX, e.clientY);
    setDragColor(colorFromEvent(e));
    setDragCurSq(sq);
  };
  const onPointerUpBoard = (e) => {
    if (!enableArrows) return;
    if (dragStartSq == null) return;
    const endSq = pointToSquare(e.clientX, e.clientY);
    const color = dragColor; // finalize with the preview color
    if (endSq && dragStartSq) {
      if (endSq === dragStartSq) {
        toggleCircle(endSq, color);
      } else {
        toggleArrow(dragStartSq, endSq, color);
      }
    }
    setDragStartSq(null);
    setDragCurSq(null);
  };
  const onContextMenuBoard = (e) => {
    if (!enableArrows) return;
    // prevent default browser context menu
    e.preventDefault();
  };

  const squareBaseStyle = { width: `${squareSize}px`, height: `${squareSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' };

  const overlayStyle = {
    position: 'absolute', top: 0, left: 0, width: `${squareSize * 8}px`, height: `${squareSize * 8}px`, pointerEvents: 'none'
  };

  const pieceImgBaseStyle = { width: `${pieceSize}px`, height: `${pieceSize}px`, userSelect: 'none', pointerEvents: 'none' };

  // Add smooth animation styles to document if not already present
  useEffect(() => {
    const styleId = 'piece-animation-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes smoothPieceMove {
          from {
            transform: translate(var(--from-x), var(--from-y));
          }
          to {
            transform: translate(var(--to-x), var(--to-y));
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const filesTop = showCoordinates ? files : [];
  const ranksLeft = showCoordinates ? ranks : [];
  const ranksRight = showCoordinates ? ranks : [];
  const filesBottom = showCoordinates ? files : [];

  return (
    <div style={containerStyle} className="chessboard-container">
      <div style={chessboardStyle} ref={wrapperRef}>
        <div
          style={boardGridStyle}
          className="chessboard-grid"
          ref={boardGridRef}
          onContextMenu={onContextMenuBoard}
          onPointerDown={onPointerDownBoard}
          onPointerMove={onPointerMoveBoard}
          onPointerUp={onPointerUpBoard}
        >
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
                  className={`chessboard-square ${light ? 'light' : 'dark'}`}
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


                </div>
              );
            })
          ))}

          {/* Animated pieces overlay */}
          <div style={overlayStyle}>
            {currentPiecesWithIds.map(p => {
              const code = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
              const { x, y } = squareToXY(p.square);
              // Use longer duration for stepback animation (smooth return), shorter for normal moves
              const transitionDuration = animatingStepback ? '800ms' : '300ms';
              const transitionTiming = animatingStepback ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // Spring-like easing for stepback
              const pieceStyle = {
                ...pieceImgBaseStyle,
                position: 'absolute',
                transform: `translate(${x}px, ${y}px)`,
                // Smooth animation: longer duration + enhanced easing for stepback, normal for regular moves
                transition: suppressTransitions ? 'none' : `transform ${transitionDuration} ${transitionTiming}`,
                willChange: 'transform', // GPU acceleration hint
              };
              return (
                <img key={p.id} src={pieceSrcFor(code)} alt={code} style={pieceStyle} />
              );
            })}
          </div>

          {/* Legal move markers overlay (on top of pieces) */}
          {selectedSquare && legalTargets.length > 0 && (
            <svg width={squareSize * 8} height={squareSize * 8} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
              {legalTargets.map((sq, idx) => {
                const { x, y } = squareToXY(sq);
                const cx = x + pieceSize / 2;
                const cy = y + pieceSize / 2;
                const r = Math.max(6, pieceSize * 0.18);
                return <circle key={idx} cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.35)" />;
              })}
            </svg>
          )}

          {/* Move Result Feedback - Checkmark/X overlay */}
          {moveResult && (
            <svg width={squareSize * 8} height={squareSize * 8} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
              {(() => {
                const { x, y } = squareToXY(moveResult.square);
                // Position at top-right corner of piece
                const cx = x + pieceSize - 7;
                const cy = y + 7;
                const radius = 12;
                const strokeWidth = 2;
                
                if (moveResult.isCorrect) {
                  // Green checkmark
                  return (
                    <g>
                      {/* Circular background */}
                      <circle cx={cx} cy={cy} r={radius} fill="#22c55e" opacity="0.95" />
                      {/* Checkmark */}
                      <path
                        d={`M ${cx - 4} ${cy - 1} L ${cx - 1} ${cy + 3} L ${cx + 5} ${cy - 3}`}
                        stroke="white"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </g>
                  );
                } else {
                  // Red X mark
                  return (
                    <g>
                      {/* Circular background */}
                      <circle cx={cx} cy={cy} r={radius} fill="#ef4444" opacity="0.95" />
                      {/* X mark */}
                      <line
                        x1={cx - 3.5}
                        y1={cy - 3.5}
                        x2={cx + 3.5}
                        y2={cy + 3.5}
                        stroke="white"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                      />
                      <line
                        x1={cx + 3.5}
                        y1={cy - 3.5}
                        x2={cx - 3.5}
                        y2={cy + 3.5}
                        stroke="white"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                }
              })()}
            </svg>
          )}

          {/* Drawings overlay (SVG) */}
          {enableArrows && (
            <svg width={squareSize * 8} height={squareSize * 8} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
              <defs>
                <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="7.5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#2ecc71" />
                </marker>
                <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="7.5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#e74c3c" />
                </marker>
                <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="7.5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#3498db" />
                </marker>
                <marker id="arrowhead-yellow" markerWidth="10" markerHeight="7" refX="7.5" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill="#f1c40f" />
                </marker>
              </defs>
              {/* Existing arrows */}
              {drawnArrows.map((a, idx) => {
                const from = squareToXY(a.from);
                const to = squareToXY(a.to);
                const color = a.color;
                const fill = color === 'red' ? '#e74c3c' : color === 'blue' ? '#3498db' : color === 'yellow' ? '#f1c40f' : '#2ecc71';
                const x1 = from.x + pieceSize/2, y1 = from.y + pieceSize/2;
                const x2 = to.x + pieceSize/2, y2 = to.y + pieceSize/2;
                // Arrow geometry without markers: shaft + head triangle
                const sw = 6;
                const dx = x2 - x1, dy = y2 - y1;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len, uy = dy / len;
                const headLen = Math.max(10, sw * 2.2);
                const halfHeadWidth = Math.max(6, sw * 1.2);
                const baseX = x2 - ux * headLen;
                const baseY = y2 - uy * headLen;
                const overlap = 0.5; // avoid anti-aliased gap between shaft and head
                const shaftX2 = baseX - ux * overlap;
                const shaftY2 = baseY - uy * overlap;
                const px = -uy, py = ux; // perpendicular unit vector
                const leftX = baseX + px * halfHeadWidth;
                const leftY = baseY + py * halfHeadWidth;
                const rightX = baseX - px * halfHeadWidth;
                const rightY = baseY - py * halfHeadWidth;
                return (
                  <g key={idx}>
                    <line x1={x1} y1={y1} x2={shaftX2} y2={shaftY2} stroke={fill} strokeWidth={sw} strokeLinecap="butt" />
                    <polygon points={`${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`} fill={fill} />
                  </g>
                );
              })}
              {/* Existing circles */}
              {drawnCircles.map((c, idx) => {
                const { x, y } = squareToXY(c.square);
                const stroke = c.color === 'red' ? '#e74c3c' : c.color === 'blue' ? '#3498db' : c.color === 'yellow' ? '#f1c40f' : '#2ecc71';
                const cx = x + pieceSize/2, cy = y + pieceSize/2;
                const r = Math.max(10, pieceSize/2 + 2);
                return (
                  <circle key={idx} cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={5} fill="none" />
                );
              })}
              {/* Live preview while dragging */}
              {dragStartSq && dragCurSq && (
                (() => {
                  const from = squareToXY(dragStartSq);
                  const to = squareToXY(dragCurSq);
                  const x1 = from.x + pieceSize/2, y1 = from.y + pieceSize/2;
                  const x2 = to.x + pieceSize/2, y2 = to.y + pieceSize/2;
                  const color = dragColor;
                  const fill = color === 'red' ? '#e74c3c' : color === 'blue' ? '#3498db' : color === 'yellow' ? '#f1c40f' : '#2ecc71';
                  // Arrow geometry without markers (preview): shaft + head triangle
                  const sw = 6;
                  const dx = x2 - x1, dy = y2 - y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const ux = dx / len, uy = dy / len;
                  const headLen = Math.max(10, sw * 2.2);
                  const halfHeadWidth = Math.max(6, sw * 1.2);
                  const baseX = x2 - ux * headLen;
                  const baseY = y2 - uy * headLen;
                  const overlap = 0.5;
                  const shaftX2 = baseX - ux * overlap;
                  const shaftY2 = baseY - uy * overlap;
                  const px = -uy, py = ux;
                  const leftX = baseX + px * halfHeadWidth;
                  const leftY = baseY + py * halfHeadWidth;
                  const rightX = baseX - px * halfHeadWidth;
                  const rightY = baseY - py * halfHeadWidth;
                  return (
                    <g>
                      <line x1={x1} y1={y1} x2={shaftX2} y2={shaftY2} stroke={fill} strokeWidth={sw} strokeLinecap="butt" />
                      <polygon points={`${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`} fill={fill} />
                    </g>
                  );
                })()
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chessboard;