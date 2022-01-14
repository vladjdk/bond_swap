import { LCDClient, Coin, Int } from "@terra-money/terra.js";
import sqlite3 from "sqlite3";
import os from "os";
import { exit } from "process";
import { start } from "repl";

var db = new sqlite3.Database(`${os.homedir()}/db/bondswap.db`, (err) => {
    if(err) {
        console.error(err.message);
    } else {
        console.log('Connected to the database.')
    }
});

//connect to bombay testnet
const terra =  new LCDClient({
    URL: 'https://lcd.terra.dev',
    chainID: 'columbus-5',
});

const blocksBack = 100;

const pools = {
    ts_lunabluna:"terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p"
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function standardDeviation(values){
    var avg = average(values);
    
    var squareDiffs = values.map(function(value){
      var diff = value - avg;
      var sqrDiff = diff * diff;
      return sqrDiff;
    });
    
    var avgSquareDiff = average(squareDiffs);
  
    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}
  
function average(data){
    var sum = data.reduce(function(sum, value){
        return sum + value;
    }, 0);

    var avg = sum / data.length;
    return avg;
}

var simulation = "https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22simulation%22%3A%7B%22offer_asset%22%3A%7B%22amount%22%3A%221000000000%22%2C%22info%22%3A%7B%22native_token%22%3A%7B%22denom%22%3A%22uluna%22%7D%7D%7D%7D%7D";
var reverse_simulation = "https://fcd.terra.dev/wasm/contracts/terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p/store?query_msg=%7B%22simulation%22%3A%7B%22offer_asset%22%3A%7B%22amount%22%3A%221000000000%22%2C%22info%22%3A%7B%22token%22%3A%7B%22contract_addr%22%3A%22terra1kc87mu460fwkqte29rquh4hc20m54fxwtsx7gp%22%7D%7D%7D%7D%7D";

var price = [];
var currentPrice = 0;
var all = [];
var m = 0;
var std = 0;
var id = 0;

var currentBlockInfo = await terra.tendermint.blockInfo();
// console.log(currentBlockInfo)
var currentHeight = currentBlockInfo.block.header.height;
var startingBlockHeight = 0;

const lastRowQuery = "SELECT * FROM ts_luna_bluna ORDER BY id DESC LIMIT 1";
db.all(lastRowQuery, [], (err, rows) => {
    if (err) {
      throw err;
    }
    //{ id: 103, block: 6076806, price: 0.9956316334725731 }
    const row = rows[0];
    if(row != undefined) {
        id = row.id;
        id++;
        startingBlockHeight = row.block;
    } else {
        startingBlockHeight = currentHeight-blocksBack;
    }
    console.log(startingBlockHeight)
});

db.close();

while(true) {

    //three cases for initialization:
    //  1. database is empty => fill database for past X blocks from scratch
    //  2. database has values out of window => fill database to fill in the past
    //  3. database has values in window => fill database fully

    var currentBlockInfo = await terra.tendermint.blockInfo();
    // console.log(currentBlockInfo)
    var currentHeight = currentBlockInfo.block.header.height;

    console.log(`Current Block: ${currentHeight}`);

    var promises = []
    var c = 0;
    for(var i = parseInt(startingBlockHeight)+1; i<=currentHeight; i++) {
        promises.push(terra.apiRequester.getRaw(`https://fcd.terra.dev/wasm/contracts/${pools.ts_lunabluna}/store?query_msg=%7B%22pool%22:%7B%7D%7D&height=${i}`));
        if(c%10==0) {
            await sleep(1000);
        }
        c++;
        if(c%1000==0) {
            console.log(`${c} : ${i} FINISHED...`)
        }
    }

    var all = [];
    //waiting for and implicitly sorting all the promises by block height
    await Promise.all(promises).then(res => {
        for(const c in res) {
            // console.log(res[c].height);

            const block = res[c].height;
            const price = res[c].result.assets[1].amount/res[c].result.assets[0].amount;
            // blocks.push(res[c].height);
            // price.push(res[c].result.assets[1].amount/res[c].result.assets[0].amount)
            // console.log(res[c].result.assets[0]);
            // console.log(res[c].result.assets[1]);
            // console.log(res[c].result.assets[1].amount/res[c].result.assets[0].amount);
            all.push([id, block, price]);
            id++;
        }
    });


    var flatRow = [];
    all.forEach((arr) => {arr.forEach((item) => {flatRow.push(item)})});

    let placeholders = all.map(() => '(?, ?, ?)').join(',');
    let sql = 'INSERT INTO ts_luna_bluna(id,block,price) VALUES ' + placeholders;

    db.run(sql, flatRow, (err) => {
        if(err) {
            return console.log(err.message); 
        }
        console.log(`Row was added to the table.`);
    });

    if(all.length>0){
        startingBlockHeight = all[all.length-1][1];
    }
    
    m = average(price);
    std = standardDeviation(price);

    if(all.length>0){

        currentPrice = all[all.length-1][2]
    }

    console.log(`Mean: ${m}`);
    console.log(`Standard Deviation: ${std}`);
    console.log(`Current Price: ${currentPrice}`);
    console.log();
    // console.log(`Last Price: ${lastPrice}`)

    await sleep(3000); //poll every 3 seconds

}