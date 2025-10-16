import React, { useMemo } from 'react';
import { Chess } from 'chess.js';

/**
 * Non-interactive chess board preview component
 * Displays a static chess position from a FEN string
 * Perfect for puzzle previews in lists/grids
 */
const ChessBoardPreview = ({
  position,              // FEN string
  orientation = 'auto', // 'white' | 'black' | 'auto' (auto detects from FEN whose turn it is)
  size = 200,           // Size in pixels (square board)
  showCoordinates = false
}) => {
  // Parse the position
  const chess = useMemo(() => {
    try {
      return new Chess(position);
    } catch {
      return new Chess(); // Default starting position if FEN is invalid
    }
  }, [position]);

  // Determine board orientation
  // If 'auto', show from the perspective of the side to move
  const boardOrientation = useMemo(() => {
    if (orientation === 'auto') {
      return chess.turn() === 'w' ? 'white' : 'black';
    }
    return orientation;
  }, [orientation, chess]);

  // Piece image URLs (using lichess CDN)
  const pieceSrcFor = (code) => {
    if (!code) return null;
    const isWhite = code === code.toUpperCase();
    const side = isWhite ? 'w' : 'b';
    const type = code.toUpperCase(); // K Q R B N P
    return `https://lichess1.org/assets/piece/cburnett/${side}${type}.svg`;
  };

  // Build 8x8 array of pieces from FEN
  const board = useMemo(() => {
    const b = chess.board(); // array[8][8] from rank 8 to 1, files a to h
    return b.map(row => 
      row.map(cell => 
        cell ? (cell.color === 'w' ? cell.type.toUpperCase() : cell.type) : null
      )
    );
  }, [chess]);

  const filesWhite = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const filesBlack = [...filesWhite].reverse();
  const ranksWhite = [8, 7, 6, 5, 4, 3, 2, 1];
  const ranksBlack = [...ranksWhite].reverse();

  const files = boardOrientation === 'white' ? filesWhite : filesBlack;
  const ranks = boardOrientation === 'white' ? ranksWhite : ranksBlack;

  const boardDisplay = boardOrientation === 'white' 
    ? board 
    : [...board].reverse().map(r => [...r].reverse());

  const squareSize = size / 8;
  const pieceSize = squareSize * 0.85; // Pieces are 85% of square size
  const pieceOffset = (squareSize - pieceSize) / 2;

  const isSquareLight = (row, col) => (row + col) % 2 === 0;

  return (
    <div 
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
        position: 'relative',
        userSelect: 'none',
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}
    >
      {/* Board squares */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(8, ${squareSize}px)`,
          gridTemplateRows: `repeat(8, ${squareSize}px)`,
          gap: 0
        }}
      >
        {boardDisplay.map((row, rowIdx) => 
          row.map((piece, colIdx) => {
            const isLight = isSquareLight(rowIdx, colIdx);
            const square = `${files[colIdx]}${ranks[rowIdx]}`;
            
            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                style={{
                  width: `${squareSize}px`,
                  height: `${squareSize}px`,
                  backgroundColor: isLight ? '#eeeed2' : '#769656',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Coordinate labels */}
                {showCoordinates && colIdx === 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: '2px',
                      fontSize: `${squareSize * 0.15}px`,
                      fontWeight: 600,
                      color: isLight ? '#769656' : '#eeeed2',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                  >
                    {ranks[rowIdx]}
                  </div>
                )}
                {showCoordinates && rowIdx === 7 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      fontSize: `${squareSize * 0.15}px`,
                      fontWeight: 600,
                      color: isLight ? '#769656' : '#eeeed2',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}
                  >
                    {files[colIdx]}
                  </div>
                )}
                
                {/* Piece */}
                {piece && (
                  <img
                    src={pieceSrcFor(piece)}
                    alt={piece}
                    style={{
                      width: `${pieceSize}px`,
                      height: `${pieceSize}px`,
                      pointerEvents: 'none'
                    }}
                    draggable={false}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChessBoardPreview;