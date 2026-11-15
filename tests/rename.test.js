const test = require('node:test');
const assert = require('node:assert');
const { swapName } = require('../services/renameService');

test('rename swaps the old name as a whole word, any case, keeping possessives', () => {
  assert.equal(swapName("Rajveer's laptop is lagging; rajveer quit Roblox", 'Rajveer', 'mochi'), "mochi's laptop is lagging; mochi quit Roblox");
  assert.equal(swapName('Rajveerkumar stays', 'Rajveer', 'mochi'), 'Rajveerkumar stays');
  assert.equal(swapName('', 'a', 'b'), '');
});
