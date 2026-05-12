/**
 * Expressions — algorithmic step pattern evaluator.
 *
 * Supported functions (all return boolean[]):
 *   euclidean(k, n)       Bjorklund algorithm — k beats in n steps
 *   fill(prob)            random fill, each step active with probability prob
 *   rotate(expr, n)       rotate pattern left by n
 *   every(n, expr)        every n global beats, include expr steps, else empty
 *   mirror(expr)          expr + reverse(expr)
 *   $varname              variable (0–1) bound to a knob
 *
 * Usage:
 *   Expressions.evaluate("euclidean(5,8)", 8)  → [true,false,true,...]
 *   Expressions.setVar("$vol", 0.7)
 */

const Expressions = (() => {
  const vars = new Map();           // "$name" → 0–1
  const listeners = new Set();     // callbacks(varName) → called on var change

  function setVar(name, value) {
    vars.set(name, Math.max(0, Math.min(1, value)));
    listeners.forEach(fn => fn(name));
  }

  function getVar(name) {
    return vars.get(name) ?? 0;
  }

  function onVarChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ── Euclidean (Bjorklund) ────────────────────────────────────────────────
  function euclidean(k, n) {
    k = Math.max(0, Math.min(n, Math.round(k)));
    if (k === 0) return Array(n).fill(false);
    if (k === n) return Array(n).fill(true);

    let pattern = [];
    let counts  = [];
    let remainders = [];

    let divisor = n - k;
    remainders.push(k);
    let level = 0;

    while (remainders[level] > 1) {
      counts.push(Math.floor(divisor / remainders[level]));
      remainders.push(divisor % remainders[level]);
      divisor = remainders[level];
      level++;
    }
    counts.push(divisor);

    function build(lv) {
      if (lv === -1) { pattern.push(false); return; }
      if (lv === -2) { pattern.push(true);  return; }
      for (let i = 0; i < counts[lv]; i++) build(lv - 1);
      if (remainders[lv] !== 0) build(lv - 2);
    }
    build(level);
    return pattern;
  }

  // ── fill ─────────────────────────────────────────────────────────────────
  function fill(prob, n) {
    return Array.from({ length: n }, () => Math.random() < prob);
  }

  // ── rotate ───────────────────────────────────────────────────────────────
  function rotate(arr, n) {
    if (!arr.length) return arr;
    const shift = ((n % arr.length) + arr.length) % arr.length;
    return [...arr.slice(shift), ...arr.slice(0, shift)];
  }

  // ── mirror ───────────────────────────────────────────────────────────────
  function mirror(arr) {
    return [...arr, ...[...arr].reverse()];
  }

  // ── every ────────────────────────────────────────────────────────────────
  // Returns the expr pattern if the current global beat number is a multiple of n, else empty
  let globalBeat = 0;
  function setGlobalBeat(b) { globalBeat = b; }

  function everyFn(n, arr) {
    if ((globalBeat % Math.round(n)) === 0) return arr;
    return Array(arr.length).fill(false);
  }

  // ── Parser ───────────────────────────────────────────────────────────────
  // Grammar:
  //   expr     ::= call | "$varname"
  //   call     ::= IDENT "(" args ")"
  //   args     ::= expr ("," expr)* | number ("," number)*

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      if (src[i] === '(') { tokens.push({ t: 'LPAREN' }); i++; continue; }
      if (src[i] === ')') { tokens.push({ t: 'RPAREN' }); i++; continue; }
      if (src[i] === ',') { tokens.push({ t: 'COMMA'  }); i++; continue; }
      if (src[i] === '$') {
        let name = '$';
        i++;
        while (i < src.length && /[\w]/.test(src[i])) name += src[i++];
        tokens.push({ t: 'VAR', v: name });
        continue;
      }
      if (/[a-zA-Z_]/.test(src[i])) {
        let name = '';
        while (i < src.length && /[\w]/.test(src[i])) name += src[i++];
        tokens.push({ t: 'IDENT', v: name });
        continue;
      }
      if (/[\d.\-]/.test(src[i])) {
        let num = '';
        if (src[i] === '-') num += src[i++];
        while (i < src.length && /[\d.]/.test(src[i])) num += src[i++];
        tokens.push({ t: 'NUM', v: parseFloat(num) });
        continue;
      }
      i++; // skip unknown
    }
    return tokens;
  }

  function parse(tokens, stepCount) {
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume(type) {
      const tok = tokens[pos];
      if (type && tok?.t !== type) throw new Error(`Expected ${type}, got ${tok?.t}`);
      pos++;
      return tok;
    }

    function parseExpr() {
      const tok = peek();
      if (!tok) throw new Error('Unexpected end');

      if (tok.t === 'VAR') {
        consume('VAR');
        const v = getVar(tok.v);
        // $var as a pattern: treat as fill probability
        return fill(v, stepCount);
      }

      if (tok.t === 'IDENT') {
        consume('IDENT');
        consume('LPAREN');
        const fn = tok.v.toLowerCase();

        if (fn === 'euclidean') {
          const k = parseArg();
          consume('COMMA');
          const n = parseArg();
          consume('RPAREN');
          return euclidean(resolveNum(k), resolveNum(n));
        }

        if (fn === 'fill') {
          const prob = parseArg();
          consume('RPAREN');
          return fill(resolveNum(prob), stepCount);
        }

        if (fn === 'rotate') {
          const expr = parseExpr();
          consume('COMMA');
          const n = parseArg();
          consume('RPAREN');
          return rotate(expr, resolveNum(n));
        }

        if (fn === 'every') {
          const n = parseArg();
          consume('COMMA');
          const expr = parseExpr();
          consume('RPAREN');
          return everyFn(resolveNum(n), expr);
        }

        if (fn === 'mirror') {
          const expr = parseExpr();
          consume('RPAREN');
          return mirror(expr);
        }

        throw new Error(`Unknown function: ${fn}`);
      }

      throw new Error(`Unexpected token: ${tok.t}`);
    }

    function parseArg() {
      const tok = peek();
      if (tok?.t === 'NUM') { consume('NUM'); return tok.v; }
      if (tok?.t === 'VAR') { consume('VAR'); return { var: tok.v }; }
      return parseExpr();
    }

    function resolveNum(v) {
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && v.var) return getVar(v.var);
      if (Array.isArray(v)) return v.filter(Boolean).length; // count actives
      return 0;
    }

    return parseExpr();
  }

  function evaluate(src, stepCount) {
    src = (src || '').trim();
    if (!src) return null;
    try {
      const tokens = tokenize(src);
      const result = parse(tokens, stepCount);
      // Ensure length matches stepCount
      if (!Array.isArray(result)) return null;
      if (result.length === stepCount) return result;
      // Pad or trim
      if (result.length < stepCount) {
        return [...result, ...Array(stepCount - result.length).fill(false)];
      }
      return result.slice(0, stepCount);
    } catch (e) {
      return null; // signal error to caller
    }
  }

  return { evaluate, setVar, getVar, onVarChange, setGlobalBeat };
})();
