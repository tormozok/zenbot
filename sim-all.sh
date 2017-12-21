#!/bin/bash

TMP_FILE="simulations/new-summary.html"
FULL_FILE="simulations/full-summary.html"
# testing days
days=(1 3 7)
BACKFILL_DAYS=7
BACKTESTER_DAYS=3

set -x

if `gsed`; then
SED="gsed"
else
SED="sed"
fi


while true; do

echo "<table>" > $TMP_FILE

for i in `cat sim-list.txt| grep -v '#'`; do

./zenbot.sh backfill $i --days $BACKFILL_DAYS

rm ./backtesting_*.csv

scripts/auto_backtester/backtester.js $i --days $BACKTESTER_DAYS

PARAM=`cat backtesting_*.csv |  sed -n 2p | awk -F "\"*,\"*" '{print " --trend_ema=" $13  " --oversold_rsi=" $16 " --oversold_rsi_periods=" $15 " --neutral_rate=" $14 " --period=" $10  "  --min_periods=" $11 }'`

echo "<tr><td colspan='6'>$i $PARAM</td></tr>" >> $TMP_FILE

rm -fv simulations/sim*
rm -fv ./backtesting_*.csv

for d in ${days[@]};  do

IFS=
OUT=`./zenbot.sh sim $i --days=$d --filename=simulations/$i-$d-days.html $PARAM | $SED -r "s/\x1B\[([0-9]{1,2}(;[0-9]{1,2})?)?[mGK]//g" | egrep '^[a-z]+.*:.*' | tr '\n' '\t' | $SED 's/\t/<\/td><td>/g'`
OUT=`echo "<tr><td>$d days|</td><td>$OUT</td></tr>"`

echo "$OUT"

echo $OUT >> $TMP_FILE

IFS=$'\n'

done

echo "<tr><td>---</td></tr>" >> $TMP_FILE   

done

echo "</table>" >> $TMP_FILE   

mv -f $TMP_FILE $FULL_FILE

done
