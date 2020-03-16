const Apify = require("apify");

const getDataFromIdnes = async ()=>{
    let infectedByBabisNewspapers;
    try {
        const response = await Apify.utils.requestAsBrowser({
            url: "https://servis.idnes.cz/includetojson.aspx?inc=sph/mega_box_top_koronavirus.htm",
            proxyUrl: Apify.getApifyProxyUrl({groups: ["CZECH_LUMINATI"]}),
            abortFunction: () => false,
            json:true,
        });
        const {body: {root}} = response;
        const totalInfected = root.find(data => data.hasOwnProperty("nakazenych"));
        const totalDeaths = root.find(data => data.hasOwnProperty("mrtvych"));
        const totalCured = root.find(data => data.hasOwnProperty("uzdravenych"));
        infectedByBabisNewspapers = {
            totalInfected: parseInt(totalInfected.nakazenych, 10),
            totalDeaths: parseInt(totalDeaths.mrtvych, 10),
            totalCured: parseInt(totalCured.uzdravenych, 10),
        }
    } catch (e) {
        console.log("Could not get data from Idnes", e);
    }
    return  infectedByBabisNewspapers;
};

module.exports = getDataFromIdnes;
