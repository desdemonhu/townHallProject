(function(module) {
  function TownHall (opts) {
    for (var key in opts) {
      this[key] = opts[key];
    }
  }
  //Global data stete
  TownHall.allTownHalls = [];
  TownHall.allMoCs = [];
  TownHall.allStates = [];
  TownHall.currentContext = [];
  TownHall.filters = {};
  TownHall.sortOn = 'State';
  TownHall.filteredResults = [];
  TownHall.isCurrentContext = false;
  TownHall.isMap = false;
  TownHall.zipQuery;

  // Lookup dictionaries
  TownHall.timeZones = {
    PST : 'America/Los_Angeles',
    MST : 'America/Denver',
    CST : 'America/Chicago',
    EST : 'America/New_York',
    other : 'no time zone'
  };

  //FIREBASE METHODS
  // Initialize Firebase
  var config = {
    apiKey: 'AIzaSyDwZ41RWIytGELNBnVpDr7Y_k1ox2F2Heg',
    authDomain: 'townhallproject-86312.firebaseapp.com',
    databaseURL: 'https://townhallproject-86312.firebaseio.com',
    storageBucket: 'townhallproject-86312.appspot.com',
    messagingSenderId: '208752196071'
  };

  firebase.initializeApp(config);
  var firebasedb = firebase.database();

  TownHall.saveZipLookup = function (zip) {
    firebasedb.ref('/zipZeroResults/' + zip).once('value').then(function(snapshot){
      if (snapshot.exists()) {
        newVal = snapshot.val() + 1;
      }
      else {
        newVal = 1;
      }
      return firebasedb.ref('/zipZeroResults/' + zip).set(newVal);
    });
  };

  TownHall.prototype.isInFuture = function (){
    this.dateObj = new Date(this.Date);
    var now = new Date();
    if (now - this.dateObj < 0) {
      return true;
    }
  };

  //Handlebars write
  TownHall.prototype.toHtml= function(templateid){
    var source = $(templateid).html();
    var renderTemplate = Handlebars.compile(source);
    return renderTemplate(this);
  };

  // Takes an array of TownHalls and sorts by sortOn field
  TownHall.sortFunction = function(a, b) {
    if (a[TownHall.sortOn] && b[TownHall.sortOn]) {
      if (parseInt(b[TownHall.sortOn])) {
        return a[TownHall.sortOn] - b[TownHall.sortOn];
      }
      else {
        return a[TownHall.sortOn].toLowerCase().localeCompare(b[TownHall.sortOn].toLowerCase());
      }
    }
  };

  TownHall.getFilteredResults = function(data) {
    // Itterate through all active filters and pull out any townhalls that match them
    // At least one attribute from within each filter group must match
    return TownHall.filteredResults = Object.keys(TownHall.filters).reduce(function(filteredData, key) {
      return filteredData.filter(function(townhall) {
        // Currently some of the data is inconsistent.  Some parties are listed as "Democrat" and some are listed as "Democratic", etc
        // TODO:  Once data is sanatized use return TownHall.filters[key].indexOf(townhall[key]) !== -1;
        return TownHall.filters[key].some(function(filter) {
          return filter.slice(0, 8) === townhall[key].slice(0, 8);
        });
      });
    }, data).sort(TownHall.sortFunction);
  };

  // METHODS IN RESPONSE TO lookup
  // Converts zip to lat lng google obj
  TownHall.lookupZip = function (zip) {
    return new Promise(function (resolve, reject) {
      firebasedb.ref('/zipToDistrict/' + zip).once('value').then(function(snapshot) {
        if (snapshot.exists()) {
          var districts = [];
          snapshot.forEach(function(ele){
            districts.push(ele.val());
          });
          resolve(districts);
          // var zipQueryLoc = new google.maps.LatLng(snapshot.val().LAT, snapshot.val().LNG);
          // TownHall.zipQuery = zipQueryLoc;
          // TownHall.returnNearest(zipQueryLoc).then(function(sorted) {
          //   resolve (sorted);
          // });
        } else {
          reject ('That zip code is not in our database, if you think this is an error please email us.');
        }
      });
    });
  };

  TownHall.lookupReps = function (key, value) {
    if (key === 'zip') {
      var representativePromise = $.ajax({
        url: 'https://congress.api.sunlightfoundation.com/legislators/locate?' + key + '=' + value,
        dataType: 'jsonp'
      });
    } else if (key === 'state') {
      var representativePromise = $.ajax({
        url: 'https://congress.api.sunlightfoundation.com/legislators?state=' + value + '&chamber=senate',
        dataType: 'jsonp'
      });
    } else {
      var representativePromise = $.ajax({
        url: 'https://congress.api.sunlightfoundation.com/legislators?state=' + key + '&district=' + value,
        dataType: 'jsonp'
      });
    }

    return representativePromise;
  };

  // given a zip, returns sorted array of events
  TownHall.returnNearest = function (zipQueryLoc) {
    var locations = [];
    return firebase.database().ref('/townHalls').once('value').then(function(snapshot) {
      snapshot.forEach(function(ele){
        if (ele.val().meetingType !== 'DC Event' && ele.val().meetingType !== 'Coffee') {
          locations.push(new TownHall(ele.val()));
        }
      });
      var sorted = locations.sort(function (a , b) {
        a.dist = google.maps.geometry.spherical.computeDistanceBetween(zipQueryLoc, new google.maps.LatLng(a.lat,a.lng));
        b.dist = google.maps.geometry.spherical.computeDistanceBetween(zipQueryLoc, new google.maps.LatLng(b.lat,b.lng));
        return a.dist <= b.dist ? -1 : 1;
      });
      return sorted;
    });
  };

  // Match the looked up zip code to district #
  TownHall.matchSelectionToZip = function (state, districts) {
    var fetchedData = [];
    var stateName;

    // Fetch full state name
    stateData.forEach(function(n){
      if (n.USPS === state) {
        stateName = n.Name;
      }
    });

    fetchedData = TownHall.allTownHalls.filter(function(townhall){
      return townhall.State === stateName && townhall.meetingType !== 'DC Event';
    }).reduce(function(acc, curtownhall){
      if (curtownhall.District === 'Senate') {
        acc.push(curtownhall);
      } else {
        districts.forEach(function(d) {
          var districtMatcher = parseInt(d);
          var dataMatcher = parseInt(curtownhall.District.split('-')[1]);
          dataMatcher = dataMatcher === 0 ? 1 : dataMatcher;
          if (districtMatcher === dataMatcher) {
            acc.push(curtownhall);
          }
        });
      }
      return acc;
    },[]);
    return fetchedData;
  };

  TownHall.addFilter = function(filter, value) {
    if (!TownHall.filters.hasOwnProperty(filter)) {
      TownHall.filters[filter] = [value];
    } else {
      TownHall.filters[filter].push(value);
    }
  };

  TownHall.removeFilter = function(filter, value) {
    var index = TownHall.filters[filter].indexOf(value);
    if (index !== -1) {
      TownHall.filters[filter].splice(index, 1);
    }
    if (TownHall.filters[filter].length === 0) {
      delete TownHall.filters[filter];
    }
  };

  TownHall.removeFilterCategory = function(category) {
    delete TownHall.filters[category];
  };

  TownHall.resetFilters = function() {
    Object.keys(TownHall.filters).forEach(function(key) {
      delete TownHall.filters[key];
    });
  };

  TownHall.addFilterIndexes = function(townhall) {
    if (TownHall.allStates.indexOf(townhall.State) === -1) {
      TownHall.allStates.push(townhall.State);
    }
    if (TownHall.allMoCs.indexOf(townhall.Member) === -1) {
      TownHall.allMoCs.push(townhall.Member);
    }
  };

  module.TownHall = TownHall;
})(window);