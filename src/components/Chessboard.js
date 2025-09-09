import React, { useMemo, useState } from 'react';
import { Chess } from 'chess.js';

/**
 * Interactive Chessboard
 * - FEN input, legal moves highlighting, basic move handling
 * - Orientation (white/black), last-move highlight, coordinates on all sides
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
  React.useEffect(() => {
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
  const rankLabelStyle = { height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#444', fontSize: '0.8rem', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' };

  const boardGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(8, 56px)', gridTemplateRows: 'repeat(8, 56px)', gap: '0' };

  const squareBaseStyle = { width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' };

  const pieceImgStyle = { width: '46px', height: '46px', userSelect: 'none', pointerEvents: 'none' };

  const filesTop = showCoordinates ? files : [];
  const ranksLeft = showCoordinates ? ranks : [];
  const ranksRight = showCoordinates ? ranks : [];
  const filesBottom = showCoordinates ? files : [];

  return (
    <div style={containerStyle}>
      <div style={chessboardStyle}>
        <div style={boardGridStyle}>
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

                  {piece && (
                    <img src={pieceSrcFor(piece)} alt={piece} style={pieceImgStyle} />
                  )}
                </div>
              );
            })
          ))}
        </div>
      </div>
    </div>
  );
};

export default Chessboard;