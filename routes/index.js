/**
 * New node file
 */
var mongoClient=require('mongodb').MongoClient;
var session=require('express-session');
var aws=require('aws-sdk');
var fs=require('fs');
var events = require('events');
var EventEmitter = events.EventEmitter;

var emitEvent = new EventEmitter();
var retrieveEvent=new EventEmitter();
var imageUploadEvent=new EventEmitter();
var uploadStatus=false;
var session_var;
var coll_config=require('../configuration/collectionConfig');

aws.config.loadFromPath('./s3/accDetails.json');

//USER LOGIN(RENDERS FIRST PAGE)
exports.index= function(req,res){
	//res.redirect('/UserLogin');
	res.render('UserLogin');
	
};

//GET METHOD FOR LOGIN PAGE BY MAINTAINING SESSION (USING FACEBOOK LOGIN)
exports.getlogin=function(req, res){
	if(session_var.email){
	//	console.log("session_var"+JSON.stringify(session_var));
		req.session.destroy(function(err){
	
			if (err) throw err;
	
			else{
				req.logout();
				res.render('UserLogin');
			}
		//	console.log("after logout session"+JSON.stringify(session_var));
		});
	}
	else{
	//	console.log("session_var"+JSON.stringify(session_var));
		res.render('UserLogin');
	}
};

//GET METHOD TO DISPLAY HOME PAGE
exports.getHomepage=function(req,res){
	
		session_var=req.session;
		session_var.email=req.user.emails[0].value;
	//	console.log("session_var"+JSON.stringify(session_var));
		res.render('Home',{ session_var: session_var.email });
	
};


//TO GET THE ANALYSIS OF USER ACCESS OF S3 BUCKET(HOW MANY IMAGES UPLOADED PER USER)
exports.getAnalysis=function(req,res){
	var email=[];
	mongoClient.connect('mongodb://localhost:27017/usercredentials',function(err,db){
	  		
		var cursor=db.collection('user').find({});
		cursor.each(function(err,doc){
			
				if (doc===null){
					db.close();
					emitEvent.emit('trversal',email);
				}
				else{
						email.push(doc.email);
					}
		});
		
	});
		
		emitEvent.on('trversal',function(email){
			var count=0
			email.forEach(function(value) {
				count=count+1;
				
				mongoClient.connect("mongodb://localhost:27017/usercredentials",function(err,db){
					db.collection('s3storage').findOne({'user':value},{'user_access':true,'_id':false},function(err,doc){
					if(err)throw err;
					if(doc===null)
						db.close();
					else 
						{
							console.log("email "+value);
							console.log("user_access "+doc.user_access);
						}
					});
				});
			});
			console.log("Total number of users:"+count);
		});

			
	};

// HANDELING THE IMAGE UPLOAD EVENT TO UPLOAD IMAGE TO AMAZON S3.
// ALSO RESTRICTED PER MINUTE ACCESS TO PREVENT IP THROTTLING.
//	ONLY 15 HITS PER MINUTE IS ALLOWED.
exports.handleImageUpload=function(req,res){		

		var sess=req.session;
		var user_access=0;
		var s3bucket = new aws.S3({params: {Bucket: 'project.bucket'}});
		//console.log(JSON.stringify(req.body));

			var imgUrl='images/'+req.files.files.name;
			//console.log("img path"+imgUrl);
			var ip=req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;
		//	console.log("ip:"+ip);
			var insertedTime=0;
			
			//FIND AND UPDATE RATEBUCKET COLLECTION FOR PARTICULAR IP ADDRESS ND INCREASE THE COUNT IF THE ENTRY IN DATABASE IS FOUND.
			//IF NOT INSERT A NEW ONE IN DATABASE.
			mongoClient.connect('mongodb://localhost:27017/usercredentials',function(err,db){
					
					db.collection('ratebucket').findAndModify({'ip':ip},[],{$inc:{'hits':1}},{upsert:false},function(err,doc){
					
						if(!doc){
							
							db.collection('ratebucket').ensureIndex( { 'createdAt': 1 }, { expireAfterSeconds: 75 },function(err,doc){
								db.collection('ratebucket').insert({'createdAt':Date.now(), 'ip':ip,'hits':1,},function(err,doc1){
									
								//	console.log("inserted successfully");
									var imgUrl='images/'+req.files.files.name;
									console.log("On server img path is::"+imgUrl);
									imageUploadEvent.emit('upload',imgUrl,req);
									
								});
									
							} );
							
						}
						
						// CHECK FOR A PERIOD IF IT IS NOT 60 SEC AND HIT COUNT IS GRATER THAN 15 THEN DISPLAYS MESSAGE.
						// ELSE INSERTION WILL BE SUCCESSFUL.
						else{
						
							db.collection('ratebucket').findOne({'ip':ip},function(err,doc2){
								insertedTime=doc2.createdAt;
								var hitcount=doc.hits;
								var currentTime=new Date().getTime();	
								var diff=(currentTime-insertedTime)/1000;
								//console.log('Time difference:'+diff);
								if(diff<coll_config.ttl){
									if(hitcount>coll_config.rateLimits.maxHits )
									{
										console.log('You have reached the maximum limit to access api per minute try again after some time');
										db.close();
									}
									else{
									
										var imgUrl='images/'+req.files.files.name;
										console.log("On server img path is::"+imgUrl);
										imageUploadEvent.emit('upload',imgUrl,req);
									}
									}else{
									db.collection('ratebucket').remove({'ip':ip},function(err,doc){
										if (err) throw err;
										db.collection('ratebucket').insert({'createdAt':Date.now(), 'ip':ip,'hits':1,},function(err,doc1){
										//	console.log("inserted successfully");
											var imgUrl='images/'+req.files.files.name;
											console.log("img path"+imgUrl);
											imageUploadEvent.emit('upload',imgUrl,req);
										
										});
								});
							}
							
						});
					}
					});
				});
    		  	
};
	
imageUploadEvent.on('upload',function(imgUrl,req){
	var sess=req.session;
	var user_access=0;
	var s3bucket = new aws.S3({params: {Bucket: 'project.bucket'}});
	//console.log(JSON.stringify(req.body));

	fs.readFile(imgUrl, function(err, data){
        if (err) { console.log(err); }
        else {
        		s3bucket.upload({Key: sess.email, Body: data, ContentType: req.files.files.mimetype},function(err,data){
        	    if (err) {
        		      console.log("Error uploading data: ", err);
        		}
          	    else {
           		      console.log("Successfully uploaded data to bucket :"+JSON.stringify(data));
           		      var params = { Key: sess.email};
           		  	  var url = s3bucket.getSignedUrl('getObject', params);
           		  	  console.log("Got a signed URL:", url);
           		  	  mongoClient.connect('mongodb://localhost:27017/usercredentials',function(err,db){
            		  	if (err) throw err;

            		  	var query={'user':sess.email};
            		  	db.collection('s3storage').findOne(query,function(err,doc){
            		  	
            		  		if(doc===null){
            		  				var query={'user':sess.email,'type':'image','user_access':user_access};
                		  			db.collection('s3storage').insert(query,function(err,doc){
                		  				if(err)throw err;
                		  				console.log("\nDatabase Insertion successful "+JSON.stringify(doc));
                		  				
                		  			});
                		  			
            		  		}
            		  			
            		  	var query={'user':sess.email};
                		var push={$push:{'url':url}}
                		db.collection('s3storage').update(query,push,function(err,doc){
                		
                			if (err) throw err;
                		  				
                		 // 	console.log("\nupdated");
                		  	var inc={$inc:{'user_access':1}};
                        	db.collection('s3storage').update(query,inc,function(err,doc){
                        	if(err)throw err;
                        	
                        	else
                        	{
                        //		console.log("\nuser_access inreamented by 1");
                        		console.log("Your total signed urls in the database are:");
                        		  					
                        		db.collection('s3storage').find({'user':sess.email},{'url':true,'user_access':true,'_id':false},function(err,cursor){
                        			if (err)throw err;
                        		
                        			else
                        			{
                        				cursor.each(function(err,doc){
                        					if(doc===null)
                        					{
                        						db.close();
                        					}
                        					else
                        						console.log("Total url inserted: \n"+JSON.stringify(doc.url)+"\n and user access rate is: "+doc.user_access);
                        		  									
                        			  });
                        			}
                        		  });
                        	   }
                             });
                		  				
                		});
            		   });
           		  	  });
          	    	}
        		});
          }
	});
	
});
	