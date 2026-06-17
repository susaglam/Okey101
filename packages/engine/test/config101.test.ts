import { describe, it, expect } from 'vitest';
import { KLASIK_101, buildDeck } from '../src/index';

describe('KLASIK_101 config', () => {
  it('has openingThreshold 101', () => {
    expect(KLASIK_101.openingThreshold).toBe(101);
  });
  it('has runWrap13to1 false', () => {
    expect(KLASIK_101.runWrap13to1).toBe(false);
  });
  it('has scoringModel yuzbir-penalty', () => {
    expect(KLASIK_101.scoringModel).toBe('yuzbir-penalty');
  });
  it('has tilesInRack 21', () => {
    expect(KLASIK_101.tilesInRack).toBe(21);
  });
  it('has matchHands 11', () => {
    expect(KLASIK_101.matchHands).toBe(11);
  });
  it('has pairsOpenCount 5', () => {
    expect(KLASIK_101.pairsOpenCount).toBe(5);
  });
  it('has layOffCapPerRun 2', () => {
    expect(KLASIK_101.layOffCapPerRun).toBe(2);
  });
  it('buildDeck produces 106 tiles', () => {
    expect(buildDeck(KLASIK_101).length).toBe(106);
  });
});
