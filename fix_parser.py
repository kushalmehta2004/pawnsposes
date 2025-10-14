import re

# Read the file
with open(r'c:\pawnsposes\src\pages\Reports.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Read the new function
with open(r'c:\pawnsposes\fix_parser.txt', 'r', encoding='utf-8') as f:
    new_function = f.read()

# Find and replace the function
pattern = r'// ✅ Helper: Parse weaknesses from unified response\s*\nconst parseWeaknessesFromUnified = \(weaknessesText\) => \{[\s\S]*?return weaknesses;\s*\n\};'

match = re.search(pattern, content)
if match:
    print(f"Found function at position {match.start()} to {match.end()}")
    print(f"Old function length: {len(match.group(0))} chars")
    print(f"New function length: {len(new_function)} chars")
    
    # Replace
    new_content = content[:match.start()] + new_function + content[match.end():]
    
    # Write back
    with open(r'c:\pawnsposes\src\pages\Reports.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("✅ Function replaced successfully!")
else:
    print("❌ Function not found!")
    print("Searching for simpler pattern...")
    
    # Try simpler pattern
    simple_pattern = r'const parseWeaknessesFromUnified'
    if re.search(simple_pattern, content):
        print("Found function declaration, but full pattern didn't match")
    else:
        print("Function declaration not found at all")