import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readPage = async (name) => readFile(`apps/site/dist/${name}/index.html`, 'utf8');
const storefront = await readPage('storefront');
assert.match(storefront, /123 Example Street, Portland, ME/);
assert.match(storefront, /Get directions/);
assert.match(storefront, /maps\/dir/);
assert.doesNotMatch(storefront, /<section[^>]+class="media"/);
assert.doesNotMatch(storefront, />Hours:/);
assert.doesNotMatch(storefront, />Testimonials</);

const serviceArea = await readPage('service-area');
assert.match(serviceArea, /Serving Portland and nearby coastal communities/);
assert.doesNotMatch(serviceArea, /PRIVATE ADDRESS SENTINEL|99 Secret Lane|123 Example Street/);
assert.doesNotMatch(serviceArea, /<address\b|maps\/dir/);
assert.doesNotMatch(serviceArea, /<section[^>]+class="media"|>Services<|>About<|>Testimonials<|>Hours:/);
console.log('Storefront and service-area fixture assertions passed.');
