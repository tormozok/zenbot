#!/usr/bin/env node

let stopDelta = 0;
let processLimit = 8;

let shell     = require('shelljs');
let parallel  = require('run-parallel-limit');
let json2csv  = require('json2csv');
let roundp    = require('round-precision');
let fs        = require('fs');
let StripAnsi = require('strip-ansi');

let constArgs = [];
let varArgs = [];

let varArgRegEx = /--(.+)=(.+):(.+):(.+):(.+):([a-z]{0,1})/;

process.argv.slice(2).forEach(a => {
  let match = varArgRegEx.exec(a);
  if(match) {
    varArgs.push({name:match[1],value:+match[2],delta:+match[3],periods:+match[4],min:+match[5],suffix:match[6]});
  } else {
    constArgs.push(a);
  }
});

console.log("Args: ", constArgs, varArgs);

let cmdCache = {};
let startedCmds = 0;

let RunCmd = (cmd) => {
  if(cmdCache[cmd]) {
    return cmdCache[cmd];
  }

  cmdCache[cmd] = new Promise(resolve => {

    //console.log("run ->" + cmd);

    let exec = () => {
      if(startedCmds >= processLimit) {
        setTimeout(exec, 1000);
      } else {
        startedCmds ++;
        console.log("exec ->" + cmd);
        shell.exec(cmd, {silent: true, async: true}, (code, stdout, stderr) => {
          startedCmds --;
          if (code) {
            console.error("ERROR ->" + code + " " + cmd)
            console.error(stderr)
            // return cb(null, null)
            return exec();
          }
          let out = null;
          try {
            out = processOutput(stdout)
          } catch (e) {
            console.error(e)
            return exec();
          }
          resolve(out);
        });
      }
    };
    exec();
  });
  return cmdCache[cmd];
};

let processOutput = output => {
  let jsonRegexp    = /(\{[\s\S]*?\})\send balance/g;
  let endBalRegexp  = /end balance: (\d+\.\d+) \(/g;
  let buyHoldRegexp  = /buy hold: (\d+\.\d+) \(/g;
  let vsBuyHoldRegexp  = /vs. buy hold: (-?\d+\.\d+)%/g;
  let wlRegexp      = /win\/loss: (\d+)\/(\d+)/g;
  let errRegexp     = /error rate: (.*)%/g;

  let strippedOutput = StripAnsi(output);
  let output2 = strippedOutput.substr(strippedOutput.length - 3500);

  let rawParams     = jsonRegexp.exec(output2)[1];
  let params        = JSON.parse(rawParams);
  let endBalance    = endBalRegexp.exec(output2)[1];
  let buyHold       = buyHoldRegexp.exec(output2)[1];
  let vsBuyHold     = vsBuyHoldRegexp.exec(output2)[1];
  let wlMatch       = wlRegexp.exec(output2);
  let errMatch      = errRegexp.exec(output2);
  let wins          = wlMatch !== null ? parseInt(wlMatch[1]) : 0;
  let losses        = wlMatch !== null ? parseInt(wlMatch[2]) : 0;
  let errorRate     = errMatch !== null ? parseInt(errMatch[1]) : 0;
  let days          = parseInt(params.days);

  let roi = roundp(
    ((endBalance - params.currency_capital) / params.currency_capital) * 100,
    3
  );

  return {
    params:             rawParams.replace(/[\r\n]/g, ''),
    endBalance:         parseFloat(endBalance),
    buyHold:            parseFloat(buyHold),
    vsBuyHold:          parseFloat(vsBuyHold),
    wins:               wins,
    losses:             losses,
    errorRate:          parseFloat(errorRate),

    // cci_srsi
    cciPeriods:         params.cci_periods,
    rsiPeriods:         params.rsi_periods,
    srsiPeriods:        params.srsi_periods,
    srsiK:              params.srsi_k,
    srsiD:              params.srsi_d,
    oversoldRsi:        params.oversold_rsi,
    overboughtRsi:      params.overbought_rsi,
    oversoldCci:        params.oversold_cci,
    overboughtCci:      params.overbought_cci,
    constant:           params.consant,

    // srsi_macd
    rsiPeriods:         params.rsi_periods,
    srsiPeriods:        params.srsi_periods,
    srsiK:              params.srsi_k,
    srsiD:              params.srsi_d,
    oversoldRsi:        params.oversold_rsi,
    overboughtRsi:      params.overbought_rsi,
    emaShortPeriod:     params.ema_short_period,
    emaLongPeriod:      params.ema_long_period,
    signalPeriod:       params.signal_period,
    upTrendThreshold:   params.up_trend_threshold,
    downTrendThreshold: params.down_trend_threshold,

    // macd
    emaShortPeriod:     params.ema_short_period,
    emaLongPeriod:      params.ema_long_period,
    signalPeriod:       params.signal_period,
    upTrendThreshold:   params.up_trend_threshold,
    downTrendThreshold: params.down_trend_threshold,
    overboughtRsiPeriods: params.overbought_rsi_periods,
    overboughtRsi:      params.overbought_rsi,

    // rsi
    rsiPeriods:         params.rsi_periods,
    oversoldRsi:        params.oversold_rsi,
    overboughtRsi:      params.overbought_rsi,
    rsiRecover:         params.rsi_recover,
    rsiDrop:            params.rsi_drop,
    rsiDivsor:          params.rsi_divisor,

    // sar
    sarAf:              params.sar_af,
    sarMaxAf:           params.sar_max_af,

    // speed
    baselinePeriods:   params.baseline_periods,
    triggerFactor:     params.trigger_factor,

    // trend_ema
    trendEma:           params.trend_ema,
    neutralRate:        params.neutral_rate,
    oversoldRsiPeriods: params.oversold_rsi_periods,
    oversoldRsi:        params.oversold_rsi,

    days:               days,
    period:             params.period,
    min_periods:        params.min_periods,
    roi:                roi,
    wlRatio:            losses > 0 ? roundp(wins / losses, 3) : 'Infinity',
    frequency:          roundp((wins + losses) / days, 3)
  };
};

let vargsToStr = ars => {
  return ars.map(a => "--" + a.name + "=" + a.value + a.suffix).join(" ");
}

let mkCmd = (ars) => {
  return "./zenbot.sh sim " + constArgs.join(" ") + " " + vargsToStr(ars);
}



let run = async() => {
  let bestBalance = 0;
  let oldBalance = 0;
  do {
    oldBalance = bestBalance;

    let sims = [];

    for (var i = 0; i < varArgs.length; i++) {
      let arg = varArgs[i];
      for(var j = 0; j <= arg.periods; j++) {
        for(var s = -1; s <= 1; s +=2) {
          if(j == 0 && s == 1) {
            continue;
          }
          v = arg.value + arg.delta * j * s;
          if(v < arg.min) {
            continue;
          }
          let curArgs = JSON.parse(JSON.stringify(varArgs));
          curArgs[i].value = v;
          let cmd = mkCmd(curArgs);
          let p = RunCmd(cmd);
          let sim = {args:curArgs,p:p,endBalance:0};
          sims.push(sim);
          p.then(r => sim.endBalance = r.endBalance);
        }
      }
    }

    await Promise.all(sims.map(s => s.p));

    sims.forEach(sim => {
      if(sim.endBalance <= bestBalance) {
        return;
      }
      bestBalance = sim.endBalance;
      varArgs = sim.args;
    });

    console.log("Iteration Best -> " + bestBalance + "(+" + (bestBalance - oldBalance) + ") ");
    console.log("BestArgs: " +vargsToStr(varArgs));
  } while (Math.abs(oldBalance - bestBalance) > stopDelta);
};

run();
