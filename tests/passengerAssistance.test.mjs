import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const machine = readFileSync(new URL('../src/systems/passengerAssistance.ts', import.meta.url), 'utf8');
const cycle = readFileSync(new URL('../src/systems/stationCycle.ts', import.meta.url), 'utf8');
const departure = readFileSync(new URL('../src/systems/departureSequence.ts', import.meta.url), 'utf8');
const obstruction = readFileSync(new URL('../src/systems/doorObstruction.ts', import.meta.url), 'utf8');
const passengers = readFileSync(new URL('../src/systems/passengers.ts', import.meta.url), 'utf8');

function ordered(...needles) {
  let at = -1;
  for (const needle of needles) {
    const next = machine.indexOf(needle, at + 1);
    assert.ok(next > at, `${needle} doit apparaitre dans cet ordre`);
    at = next;
  }
}

test('les conflits interdisent le demarrage et un armement attend le dwell portes ouvertes', () => {
  for (const guard of ['emergencyStop.stage', 'doorObstructionActive()', 'b.doorBlocked', 'b.signalStop', "phase !== 'dwell'", 'runtime.doorOpen < 0.8']) {
    assert.ok(machine.includes(guard), `garde absente: ${guard}`);
  }
  assert.match(machine, /stage === 'none'.*\(phase === 'cruise'/s);
  assert.match(machine, /stage = 'armed'/);
});

test('le bloqueur dedie tient les portes et est retire avant la sequence normale', () => {
  assert.match(departure, /passengerAssistance: boolean/);
  assert.match(departure, /isDepartureHeldOpen[\s\S]*b\.passengerAssistance/);
  assert.match(cycle, /if \(isDepartureHeldOpen\(\)\)[\s\S]*setTrainDoors\(1\)[\s\S]*fired\.delete\('melody'\)/);
  ordered("setDepartureBlockers({ passengerAssistance: true })", "setDepartureBlockers({ passengerAssistance: false })");
});

test('les annonces initiale prolongee et de reprise sont uniques et ordonnees', () => {
  assert.equal((machine.match(/passengerAssistanceInitialAnnouncement\(\)/g) ?? []).length, 1);
  assert.equal((machine.match(/passengerAssistanceWaitAnnouncement\(\)/g) ?? []).length, 1);
  assert.equal((machine.match(/passengerAssistanceResumeAnnouncement\(\)/g) ?? []).length, 1);
  ordered('passengerAssistanceInitialAnnouncement()', 'passengerAssistanceWaitAnnouncement()', 'passengerAssistanceResumeAnnouncement()', "stage = 'released'");
  assert.match(machine, /prolongedAt: assist >= 70 \? 55 : null/);
  assert.match(machine, /!announcedWait[\s\S]*announcedWait = true/);
});

test('le plan aleatoire est tire une fois et injectable', () => {
  assert.match(machine, /drawPassengerAssistancePlan\(random: \(\) => number = Math\.random\)/);
  for (const duration of ['reaction:', 'assist,', 'alight:', 'finalCheck:', 'resume:']) assert.ok(machine.includes(duration));
  assert.match(machine, /const GAP_MIN = 52/);
  assert.match(machine, /const GAP_MAX = 104/);
});

test('voyageur et agent sont nettoyes sans neutraliser les obstructions suivantes', () => {
  assert.match(passengers, /removeAssistedPassenger[\s\S]*releaseSlots\(p\)[\s\S]*p\.state = 'hidden'/);
  assert.match(machine, /if \(passengerId != null && snapshot\) effects\.restorePassenger/);
  assert.match(machine, /effects\.releaseAgent\(\)/);
  assert.match(obstruction, /cancelArmedDoorObstruction[\s\S]*armed = null/);
  assert.match(departure, /doorBlocked \|\|[\s\S]*passengerAssistance/);
});
