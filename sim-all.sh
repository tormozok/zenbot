#!/bin/bash

TMP_FILE="simulations/new-summary.html"
FULL_FILE="simulations/full-summary.html"
# testing days
days=(1 2 3 4 5 6 7 8)
#days=(1)
BACKFILL_DAYS=8
#BACKFILL_DAYS=1
BACKTESTER_DAYS=8
#BACKTESTER_DAYS=1

#STATIC_PARAM="--order_type=maker"
STATIC_PARAM="--order_type=taker"
TEST_PARAM="--period=300:20:20:s --trend_ema=26:1:10: --profit_stop_enable_pct=5:1:1: --profit_stop_pct=5:1:1: --oversold_rsi=27:1:1: --oversold_rsi_periods=20:1:1:"

set -x


#while true; do

echo "<table>" > $TMP_FILE

for i in `cat sim-list.txt| grep -v '#'`; do

go=true

while $go; do
go=false

./zenbot.sh backfill $i --days $BACKFILL_DAYS

if [ $? -ne 0 ] ; then
  go=true
  continue
fi

# rm *.csv

scripts/auto_backtester/descend.js $i --days=$BACKTESTER_DAYS $STATIC_PARAM $TEST_PARAM | tee descend.txt

cat descend.txt

PARAM=`cat descend.txt | grep BestArgs: | tail -n1 | tr -d '\n' | sed 's/BestArgs://'`

# scripts/auto_backtester/backtester.js $i --days $BACKTESTER_DAYS --profit_stop_pct=1 --profit_stop_enable_pct=2

if [ $? -ne 0 ] ; then
  go=true
  continue
fi

#PARAM=`cat *.csv | grep oversold_rsi_periods | sed -n 1p | awk -F "\"*,\"*" '{print " --trend_ema=" $13  " --oversold_rsi=" $16 " --oversold_rsi_periods=" $15 " --neutral_rate=" $14 " --period=" $10  "  --min_periods=" $11 }'`

done

#PARAM="$PARAM $DEFAULT_PARAM"

echo "<tr><td colspan='6'>$i $STATIC_PARAM $PARAM</td></tr>" >> $TMP_FILE

rm -fv simulations/sim*
# rm -fv *.csv

for d in ${days[@]};  do

./zenbot.sh sim $i --days=$d --filename=simulations/$i-$d-days.html $STATIC_PARAM $PARAM | tee sim.txt

OUT=`cat sim.txt | sed -r "s/\x1B\[([0-9]{1,3}((;[0-9]{1,3})*)?)?[m|K]//g" | egrep '^[a-z]+.*:.*' | tr '\n' '\t' | sed 's/\t/<\/td><td>/g'`
OUT=`echo "<tr><td>$d days|</td><td>$OUT</td></tr>"`

echo "$OUT"

echo $OUT >> $TMP_FILE

done

echo "<tr><td>---</td></tr>" >> $TMP_FILE

done

echo "</table>" >> $TMP_FILE

mv -f $TMP_FILE $FULL_FILE

#done
