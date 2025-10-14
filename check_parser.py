import re

# Read the file
with open(r'c:\pawnsposes\src\pages\Reports.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find parseUnifiedGeminiResponse function
pattern = r'const parseUnifiedGeminiResponse = \(analysisText, gamesData, formData\) => \{[\s\S]*?^};'
match = re.search(pattern, content, re.MULTILINE)

if match:
    func = match.group(0)
    print(f"Function length: {len(func)} chars")
    print("\n=== FUNCTION START ===")
    print(func[:2000])  # First 2000 chars
    print("\n... [middle content] ...\n")
    print(func[-1000:])  # Last 1000 chars
    print("=== FUNCTION END ===")
else:
    print("Function not found")