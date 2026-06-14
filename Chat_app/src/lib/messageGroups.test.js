// Unit tests for the chat stream's presentation logic (run with `npm test`,
// i.e. Node's built-in test runner — no browser/React needed).
//
// These pin the WhatsApp-style behaviour: own messages on the LEFT, others on
// the RIGHT, sender names only at the start of a run, and consecutive messages
// grouped. The same groupMessages() drives both historical (REST) and live
// (WebSocket) messages, so one set of tests covers both paths.

import test from 'node:test'
import assert from 'node:assert/strict'

import { groupMessages, isOwn } from './messageGroups.js'

// `from` is set upstream by comparing sender_id to the current user's id.
const me = (id, text = 'hi') => ({ id, from: 'me', sender: 'You', text, time: '10:00' })
const them = (id, sender, text = 'hey') => ({ id, from: 'them', sender, text, time: '10:01' })

test('own message is flagged mine (renders on the LEFT)', () => {
  const [row] = groupMessages([me('1')])
  assert.equal(row.mine, true)
})

test('other user message is not mine (renders on the RIGHT)', () => {
  const [row] = groupMessages([them('1', 'John')])
  assert.equal(row.mine, false)
})

test('isOwn reflects the upstream sender_id comparison', () => {
  assert.equal(isOwn(me('1')), true)
  assert.equal(isOwn(them('1', 'John')), false)
})

test('own messages never show a sender name', () => {
  const rows = groupMessages([me('1'), me('2')])
  assert.deepEqual(rows.map((r) => r.showSender), [false, false])
})

test('a sender name shows once at the start of a run, then is suppressed', () => {
  const rows = groupMessages([
    them('1', 'John'),
    them('2', 'John'),
    them('3', 'John'),
  ])
  assert.deepEqual(rows.map((r) => r.showSender), [true, false, false])
  // Consecutive same-sender messages are grouped (first is not).
  assert.deepEqual(rows.map((r) => r.grouped), [false, true, true])
})

test('alternating senders each show their name and are not grouped', () => {
  const rows = groupMessages([
    them('1', 'John'),
    them('2', 'Rahul'),
    them('3', 'John'),
  ])
  assert.deepEqual(rows.map((r) => r.showSender), [true, true, true])
  assert.deepEqual(rows.map((r) => r.grouped), [false, false, false])
})

test('switching between own and others breaks the group and re-shows the name', () => {
  // me, me, John, John, me  → matches the expected WhatsApp-style transcript.
  const rows = groupMessages([
    me('1', 'Hello everyone!'),
    me('2', 'How is the traffic today?'),
    them('3', 'John', 'Hi there!'),
    them('4', 'John', 'still here'),
    me('5', 'thanks'),
  ])
  assert.deepEqual(rows.map((r) => r.mine), [true, true, false, false, true])
  assert.deepEqual(rows.map((r) => r.grouped), [false, true, false, true, false])
  assert.deepEqual(rows.map((r) => r.showSender), [false, false, true, false, false])
})

test('a live WebSocket message is grouped/aligned by the same rules', () => {
  // History then an appended live message from the same other sender groups it.
  const history = [them('1', 'John')]
  const live = them('2', 'John')
  const rows = groupMessages([...history, live])
  assert.equal(rows[1].mine, false) // still RIGHT
  assert.equal(rows[1].grouped, true) // grouped under John
  assert.equal(rows[1].showSender, false) // name not repeated
})

test('empty history yields no rows', () => {
  assert.deepEqual(groupMessages([]), [])
})
