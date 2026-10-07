/** @type {import("lint-staged").Configuration} */
const config = {
	'*': 'prettier --write --ignore-unknown',
	'*.{js,ts,svelte}': 'eslint --no-warn-ignored'
};

export default config;
