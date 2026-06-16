import json
import os

def load_json(file_path):
	with open(file_path, 'r', encoding='utf-8') as file:
		return json.load(file)

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

# Load en-us.json
en_us = load_json('./en-us.json')

# Get all JSON files in the current directory
json_files = [f for f in os.listdir('.') if f.endswith('.json') and f != 'en-us.json']

# Compare each JSON file with en-us.json
for json_file in json_files:
	other_locale = load_json(json_file)
	missing_keys = compare_keys(en_us, other_locale)
	extra_keys = find_extra_keys(en_us, other_locale)

	print(f"{json_file}:")

	# Output missing keys
	if missing_keys:
		print(f"Missing keys in {json_file}")
		for key in missing_keys:
			print(f"\t{key}")

	# Output extra keys
	if extra_keys:
		print(f"Extra keys in {json_file}:")
		for key in extra_keys:
			print(f"\t{key}")

	if not missing_keys and not extra_keys:
		print("OK!")