#!/usr/bin/env node

let deltas = 4;
let stopDelta = 0;

let shell     = require('shelljs');
let parallel  = require('run-parallel-limit');
let json2csv  = require('json2csv');
let roundp    = require('round-precision');
let fs        = require('fs');
let StripAnsi = require('strip-ansi');

let constArgs = [];
let varArgs = [];

let varArgRegEx = /--(.+)=(.*):(.*):(.*)/;

process.argv.slice(2).forEach(a => {
  let match = varArgRegEx.exec(a);
  if(match) {
    varArgs.push({name:match[1],value:+match[2],delta:+match[3],min:+match[4]});
  } else {
    constArgs.push(a);
  }
});

console.log("Args: ", constArgs, varArgs);

let cmdCache = {};

let RunCmd = (cmd) => {
  return new Promise(resolve => {
    if(cmdCache[cmd]) {
      return resolve(cmdCache[cmd]);
    }
    let exec = () => {
      console.log(cmd)
      shell.exec(cmd, {silent: true, async: true}, callback);
    };

    let callback = (code, stdout, stderr) => {
      if (code) {
        console.error(cmd)
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
      cmdCache[cmd] = out;
      resolve(out);
    };

    exec();
  });
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
  return ars.map(a => "--" + a.name + "=" + a.value).join(" ");
}

let mkCmd = (ars) => {
  return "./zenbot.sh sim " + constArgs.join(" ") + " " + vargsToStr(ars);
}



let run = async() => {
  let bestBalance = 0;
  let oldBalance = 0;
  do {
    oldBalance = bestBalance;

    for (var i = 0; i < varArgs.length; i++) {
      let oldArgBalance = 0;
      do{
        console.log("Arg -> " + JSON.stringify(varArgs[i]));
        oldArgBalance = bestBalance;
        let ps = [];
        for (var v = Math.max(varArgs[i].value - varArgs[i].delta * deltas, varArgs[i].min);
             v <= varArgs[i].value + varArgs[i].delta * deltas;
             v += varArgs[i].delta) {
          let curArgs = JSON.parse(JSON.stringify(varArgs));
          curArgs[i].value = v;
          let cmd = mkCmd(curArgs);
          let p = RunCmd(cmd);
          p.then(r => {
            if (r.endBalance > bestBalance) {
              var old = bestBalance;
              bestBalance = r.endBalance;
              varArgs = curArgs;
              console.log("Arg Best -> " + bestBalance + "(+" + (bestBalance - old) + ") " + vargsToStr(varArgs));
            }
          });
          ps.push(p);
        }
        await Promise.all(ps);
        //console.log("Promise.all");
      } while(Math.abs(bestBalance - oldArgBalance) > stopDelta);
    }

    console.log("Iteration Best -> " + bestBalance + "(+" + (bestBalance - oldBalance) + ") " + vargsToStr(varArgs));
  } while (Math.abs(oldBalance - bestBalance) > stopDelta);
  console.log(varArgs.map(a => "--" + a.name + "=" + a.value).join(" "))
};

run();
