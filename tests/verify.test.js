import { describe, it, expect } from 'vitest';
import { verifyPlan, failures } from '../src/agent/verify';
import { incomeEstimate } from '../src/agent/economics';
import { site } from './fixtures';

const now = new Date(2026, 10, 18); // November 18, 2026
const MONTHS = ['November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'];
const picks = [
    { crop_id: 'potatoes', acres: 0.25, income: incomeEstimate('potatoes', 0.25) },
    { crop_id: 'strawberries', acres: 0.15, income: incomeEstimate('strawberries', 0.15) },
    { crop_id: 'sweet-corn', acres: 0.75, income: incomeEstimate('sweet-corn', 0.75) },
];

const TASKS = {
    November: ['Send soil samples to a lab'],
    April: ['Order seed potatoes and strawberry plants'],
    May: ['Plant potatoes after the May 11 last spring frost', 'Set out strawberry plants'],
    June: ['Seed sweet corn once the soil warms'],
};

function goodPlan() {
    return {
        summary: 'Your soil is pH 5.4. Strawberries could bring about $4,100 a year.',
        soil_test: 'Test pH, phosphorus, potassium and organic matter before liming.',
        first_steps: ['Order a lab soil test'],
        calendar: MONTHS.map((month) => ({ month, tasks: TASKS[month] || ['Check the field'] })),
    };
}

const statusOf = (checks, id) => checks.find((c) => c.id === id).status;

describe('verifyPlan (the agent’s fact-checker)', () => {
    it('passes all 7 checks for a plan that matches the data', () => {
        const checks = verifyPlan(goodPlan(), { site, picks, now });
        expect(checks).toHaveLength(7);
        expect(failures(checks)).toEqual([]);
    });

    it('catches a calendar that does not cover 12 months from now', () => {
        const plan = goodPlan();
        plan.calendar = plan.calendar.slice(1);
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'calendar')).toBe('fail');
    });

    it('catches planting a crop in the wrong month', () => {
        const plan = goodPlan();
        plan.calendar[4].tasks = ['Plant potatoes']; // March
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'planting')).toBe('fail');
    });

    it('catches a frost date that is not in the official records', () => {
        const plan = goodPlan();
        plan.summary += ' The last spring frost is around April 20.';
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'frost')).toBe('fail');
    });

    it('catches an invented dollar figure', () => {
        const plan = goodPlan();
        plan.summary = 'Strawberries could bring about $9,999 a year.';
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'money')).toBe('fail');
    });

    it('catches a soil pH that does not match the estimate', () => {
        const plan = goodPlan();
        plan.summary = 'Your soil is pH 6.8.';
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'ph')).toBe('fail');
    });

    it('allows a target pH as advice', () => {
        const plan = goodPlan();
        plan.summary += ' Lime to raise it to pH 6.5.';
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'ph')).toBe('pass');
    });

    it('catches planting a crop the rules did not choose', () => {
        const plan = goodPlan();
        plan.calendar[7].tasks = ['Plant pumpkins']; // June
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'crops')).toBe('fail');
    });

    it('requires soil test advice', () => {
        const plan = goodPlan();
        delete plan.soil_test;
        expect(statusOf(verifyPlan(plan, { site, picks, now }), 'soiltest')).toBe('fail');
    });
});
