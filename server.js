var express = require('express');
var ejs=require('ejs');
var passport = require('passport');
var util = require('util');
var FacebookStrategy = require('passport-facebook').Strategy;
var session = require('express-session')
var bodyParser = require("body-parser")
var cookieParser = require("cookie-parser")
var methodOverride = require('method-override');
var multer=require('multer');
var app=express();
var session=require('express-session');
var router=require('./routes/index.js');
var multer=require('multer');
var http=require('http');

var config=require('./configuration/config');
var mongoClient=require('mongodb').MongoClient;

//var io=require('socket-io')(http);
var args= process.argv.slice(2);


// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Facebook profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the FacebookStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Facebook
//   profile), and invoke a callback with a user object.
passport.use(new FacebookStrategy({
	clientID:config.facebook_api_key,
	clientSecret:config.facebook_api_secret,
	callbackURL:config.callback_url },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's Facebook profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Facebook account with a user record in your database,
      // and return that user instead.
    	
   	
    	if(config.database==='true'){

    		mongoClient.connect("mongodb://localhost:27017/usercredentials",function(err,db){
    			if(err)throw err;
    			
    			var user_check={ 'email':profile.emails[0].value};
    		
    		//	console.log("Id:"+profile.id);
    		//	console.log("FB Email:"+JSON.stringify(profile.emails[0].value));
    			
    			//check to see if user exists
    			var counter=0;
    	        db.collection('user').findOne(user_check,function(err,doc){
    	        	
    	          if(doc===null){
    	        	
    	        		var insert_query={ 'email':profile.emails[0].value, "_id":profile.id};
        				
    	        		db.collection('user').insert(insert_query,function(err,inserted){
        					if(err)throw err;
        					//console.log("\nSuccessful insertion" +JSON.stringify(inserted));
        				});
    	        	}else{
    		        //	console.log("\nUser already exist");
    		        	}
    	        });
    		//	db.close();
    		});
    	
    	}	
  	
    	//console.log("profile:"+JSON.stringify(profile));
      return done(null, profile);
    });
  }
));




var app = express();

// configure Express
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(session({ secret: 'keyboard cat' ,resave:true, saveUninitialized:true}));
  app.use(cookieParser());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended:true}));
  app.use(methodOverride());
  app.use(multer({dest:'./images/',
		remane:function(fieldname,filename){
			uploadedFile=filename+Date.now();
			return uploadedFile;
		},
		
		onFileUploadComplete:function(file){
			console.log(file.fieldname+' uploaded to '+file.path);
		//	done=true;
		}

}));
 
  // Initialize Passport!  Also use passport.session() middleware, to support
  // persistent login sessions (recommended).
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(express.static(__dirname + '/public'));
 
  app.get('/',router.index);

  app.get('/UserLogin',router.getlogin);

  app.get('/Home',ensureAuthenticated,router.getHomepage);

  app.post('/Home',router.handleImageUpload);

  app.get('/Analyse',router.getAnalysis);
// GET /auth/facebook
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Facebook authentication will involve
//   redirecting the user to facebook.com.  After authorization, Facebook will
//   redirect the user back to this application at /auth/facebook/callback
app.get('/auth/facebook',
  passport.authenticate('facebook',{ scope: ['user_status','email']}),
  function(req, res){
    // The request will be redirected to Facebook for authentication, so this
    // function will not be called.
  });

// GET /auth/facebook/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { failureRedirect: '/' }),
  function(req, res) {
    res.redirect('/Home');
  });


app.listen(3000);


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}
