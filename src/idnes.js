const Apify = require("apify");

const getDataFromIdnes = async ()=>{
    let infectedByBabisNewspapers;
    try {
        const response = await Apify.utils.requestAsBrowser({
            url: "https://servis.idnes.cz/includetojson.aspx?inc=sph/mega_box_top_koronavirus.htm",
            proxyUrl: Apify.getApifyProxyUrl({groups: ["SHADER"]}),
            abortFunction: () => false,
            json:true,
        });
        const {body: {root}} = response;
        const totalInfected = root.find(data => data.hasOwnProperty("nakazenych"));
        const totalDeaths = root.find(data => data.hasOwnProperty("mrtvych"));
        const totalCured = root.find(data => data.hasOwnProperty("uzdravenych"));
        const totalTested = root.find(data => data.hasOwnProperty("testovanych"));
        const localeTextNumberToInt = txt => parseInt(txt.replace(" ", ""), 10);
        infectedByBabisNewspapers = {
            totalInfected: localeTextNumberToInt(totalInfected.nakazenych),
            totalDeaths: localeTextNumberToInt(totalDeaths.mrtvych),
            totalCured: localeTextNumberToInt(totalCured.uzdravenych),
            totalTested: localeTextNumberToInt(totalTested.testovanych),
        }
    } catch (e) {
        console.log("Could not get data from Idnes", e);
    }
    return  infectedByBabisNewspapers;
};

module.exports = getDataFromIdnes;
