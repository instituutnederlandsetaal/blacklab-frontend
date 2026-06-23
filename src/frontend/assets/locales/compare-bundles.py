import json
import os
import sys
from pathlib import Path

LOCALES_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = LOCALES_DIR.parent.parent
SOURCE_DIR = FRONTEND_DIR / 'src'

SOURCE_FILE_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.vue', '.html', '.mts', '.cts'}
IGNORED_SOURCE_DIRS = {'dist', 'node_modules'}

# These keys are intentionally assembled at runtime from data ids or small enums.
SOURCE_USAGE_PREFIX_WHITELIST = (
	'index.',
	'search.advanced.queryBuilder.boolean_operators.',
	'search.advanced.queryBuilder.comparators.',
	'results.groupBy.relationPartByClass.',
)

def load_json(file_path):
	with open(file_path, 'r', encoding='utf-8') as file:
		return json.load(file)

def flatten_keys(messages, parent_key=''):
	keys = []
	for key, value in messages.items():
		full_key = f"{parent_key}.{key}" if parent_key else key
		if isinstance(value, dict):
			keys.extend(flatten_keys(value, full_key))
		else:
			keys.append(full_key)
	return keys

def compare_keys(en_us, other_locale, parent_key=''):
	missing_keys = []
	for key in en_us:
		full_key = f"{parent_key}.{key}" if parent_key else key
		if key not in other_locale:
			missing_keys.append(full_key)
		elif isinstance(en_us[key], dict):
			missing_keys.extend(compare_keys(en_us[key], other_locale.get(key, {}), full_key))
	return missing_keys

def find_extra_keys(en_us, other_locale, parent_key=''):
	extra_keys = []
	for key in other_locale:
		full_key = f"{parent_key}.{key}" if parent_key else key
		if key not in en_us:
			extra_keys.append(full_key)
		elif isinstance(other_locale[key], dict):
			extra_keys.extend(find_extra_keys(en_us.get(key, {}), other_locale[key], full_key))
	return extra_keys

def load_source_text():
	parts = []
	for root, dirs, files in os.walk(SOURCE_DIR):
		dirs[:] = [d for d in dirs if d not in IGNORED_SOURCE_DIRS]
		for file in files:
			path = Path(root) / file
			if path.suffix in SOURCE_FILE_EXTENSIONS:
				parts.append(path.read_text(encoding='utf-8', errors='ignore'))
	return '\n'.join(parts)

def is_source_usage_whitelisted(key):
	return key.startswith(SOURCE_USAGE_PREFIX_WHITELIST)

def find_keys_missing_from_source(messages):
	source = load_source_text()
	return [
		key
		for key in flatten_keys(messages)
		if key not in source and not is_source_usage_whitelisted(key)
	]

# Load en-us.json
en_us = load_json(LOCALES_DIR / 'en-us.json')

# Get all JSON files in the current directory
json_files = [f for f in os.listdir(LOCALES_DIR) if f.endswith('.json') and f != 'en-us.json']
has_discrepancies = False

# Compare each JSON file with en-us.json
for json_file in json_files:
	other_locale = load_json(LOCALES_DIR / json_file)
	missing_keys = compare_keys(en_us, other_locale)
	extra_keys = find_extra_keys(en_us, other_locale)

	print(f"{json_file}:")

	# Output missing keys
	if missing_keys:
		has_discrepancies = True
		print(f"Missing keys in {json_file}")
		for key in missing_keys:
			print(f"\t{key}")

	# Output extra keys
	if extra_keys:
		has_discrepancies = True
		print(f"Extra keys in {json_file}:")
		for key in extra_keys:
			print(f"\t{key}")

	if not missing_keys and not extra_keys:
		print("OK!")

missing_source_keys = find_keys_missing_from_source(en_us)

print("en-us.json source usage:")

if missing_source_keys:
	has_discrepancies = True
	print("Keys not found in source code:")
	for key in missing_source_keys:
		print(f"\t{key}")
else:
	print("OK!")

if has_discrepancies:
	sys.exit(1)
