#!/usr/bin/env python3
"""Update the training options section in ReportDisplay.js"""

# Read the file
with open(r'd:\pawns-poses\src\pages\ReportDisplay.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Read the replacement
with open(r'd:\pawns-poses\TRAINING_OPTIONS_UPDATE.txt', 'r', encoding='utf-8') as f:
    replacement = f.read()

# Find the start and end markers
start_marker = '          <div className="dashboard-panel">\n            <h3>Start Your Training</h3>'
end_marker = '          </div>\n        </div>\n\n        {/* Back to Reports Button */}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    # Replace the section
    new_content = content[:start_idx] + replacement + '\n        </div>\n\n        {/* Back to Reports Button */}' + content[end_idx + len(end_marker):]
    
    # Write back
    with open(r'd:\pawns-poses\src\pages\ReportDisplay.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print('✅ Successfully updated training options section')
    print(f'   Replaced {end_idx - start_idx} characters')
else:
    print(f'❌ Could not find section')
    print(f'   start_idx={start_idx}')
    print(f'   end_idx={end_idx}')
    if start_idx != -1:
        print(f'   Found start at position {start_idx}')
        print(f'   Context: {content[start_idx:start_idx+100]}...')