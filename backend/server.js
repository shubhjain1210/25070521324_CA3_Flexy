require('dotenv').config();
const express=require('express'), mongoose=require('mongoose'), cors=require('cors'), helmet=require('helmet'), cookieParser=require('cookie-parser');
const app=express();
app.use(helmet());
app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:5173',credentials:true}));
app.use(express.json({limit:'1mb'})); app.use(cookieParser());
const movieSchema=new mongoose.Schema({
 title:{type:String,required:true,trim:true},slug:{type:String,unique:true,required:true},
 overview:String,posterUrl:String,backdropUrl:String,trailerUrl:String,streamUrl:String,streamLicense:String,streamProvider:String,releaseYear:Number,runtime:Number,
 genres:[String],director:String,cast:[String],externalRating:{type:Number,min:0,max:10,default:0},
 voteCount:Number,popularity:Number,featured:Boolean
},{timestamps:true});
movieSchema.index({title:'text',overview:'text'}); movieSchema.index({genres:1,releaseYear:-1});
const Movie=mongoose.model('Movie',movieSchema);
const userSchema=new mongoose.Schema({name:{type:String,required:true},email:{type:String,unique:true,lowercase:true},passwordHash:{type:String,select:false},role:{type:String,enum:['user','admin'],default:'user'}},{timestamps:true});
const User=mongoose.model('User',userSchema);
const watchSchema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',unique:true},movieIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Movie'}]},{timestamps:true});
const Watchlist=mongoose.model('Watchlist',watchSchema);
const reviewSchema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User'},movieId:{type:mongoose.Schema.Types.ObjectId,ref:'Movie'},rating:{type:Number,min:1,max:5},text:{type:String,maxlength:1200}},{timestamps:true});
reviewSchema.index({userId:1,movieId:1},{unique:true});
const Review=mongoose.model('Review',reviewSchema);
const jwt=require('jsonwebtoken'), bcrypt=require('bcryptjs');
const secret=()=>{
  if(process.env.JWT_SECRET)return process.env.JWT_SECRET;
  if(process.env.NODE_ENV==='production')throw new Error('JWT_SECRET must be configured in production.');
  return 'local-demo-secret-change-me';
};
const publicUser=u=>({id:u._id,name:u.name,email:u.email,role:u.role});
function issue(res,u){res.cookie('moviebox_token',jwt.sign({id:u._id},secret(),{expiresIn:'7d'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*86400000});}
async function auth(req,res,next){try{const t=req.cookies.moviebox_token;if(!t)return res.status(401).json({message:'Sign in required.'});const p=jwt.verify(t,secret());req.user=await User.findById(p.id);if(!req.user)return res.status(401).json({message:'Account not found.'});next();}catch(e){res.status(401).json({message:'Session expired. Sign in again.'});}}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({message:'Admin access required.'});next();}
// Basic per-IP auth throttling for local/single-instance deployments. Use a shared store at scale.
const authAttempts=new Map();
function authThrottle(req,res,next){
  const key=req.ip+':'+req.path, now=Date.now(), windowMs=15*60*1000, max=25;
  let entry=authAttempts.get(key);
  if(!entry||now-entry.start>windowMs)entry={start:now,count:0};
  entry.count++;authAttempts.set(key,entry);
  if(entry.count>max)return res.status(429).json({message:'Too many sign-in attempts. Please wait 15 minutes and try again.'});
  next();
}
app.use(['/api/auth/login','/api/auth/register'],authThrottle);

app.get('/api/health',(req,res)=>res.json({success:true,server:'running',database:mongoose.connection.readyState===1?'connected':'disconnected'}));
app.post('/api/auth/register',async(req,res,next)=>{try{const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return res.status(400).json({message:'Enter a name, valid email and password with at least 8 characters.'});if(await User.exists({email}))return res.status(409).json({message:'Email already registered.'});const u=await User.create({name,email,passwordHash:await bcrypt.hash(password,12)});issue(res,u);res.status(201).json({success:true,user:publicUser(u)});}catch(e){next(e);}});
app.post('/api/auth/login',async(req,res,next)=>{try{const u=await User.findOne({email:String(req.body.email||'').toLowerCase()}).select('+passwordHash');if(!u||!await bcrypt.compare(String(req.body.password||''),u.passwordHash))return res.status(401).json({message:'Incorrect email or password.'});issue(res,u);res.json({success:true,user:publicUser(u)});}catch(e){next(e);}});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('moviebox_token',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'});res.json({success:true});});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.patch('/api/auth/me',auth,async(req,res,next)=>{try{req.user.name=String(req.body.name||'').trim();if(req.user.name.length<2)return res.status(400).json({message:'Name is too short.'});await req.user.save();res.json({user:publicUser(req.user)});}catch(e){next(e);}});
app.get('/api/movies',auth,async(req,res,next)=>{try{const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(48,Math.max(1,Number(req.query.limit)||20)),filter={};const q=String(req.query.q||'').trim().slice(0,100);if(q)filter.title={$regex:q.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),$options:'i'};if(req.query.genre)filter.genres=String(req.query.genre);if(req.query.year&&Number.isFinite(Number(req.query.year)))filter.releaseYear=Number(req.query.year);if(req.query.minRating)filter.externalRating={$gte:Math.min(10,Math.max(0,Number(req.query.minRating)))};const sorts={popularity:{popularity:-1},rating:{externalRating:-1},year:{releaseYear:-1},title:{title:1},newest:{createdAt:-1}};const [data,total]=await Promise.all([Movie.find(filter).sort(sorts[req.query.sort]||sorts.popularity).skip((page-1)*limit).limit(limit),Movie.countDocuments(filter)]);res.json({success:true,data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}});}catch(e){next(e);}});
app.get('/api/movies/featured',auth,async(req,res,next)=>{try{res.json({data:await Movie.find({featured:true}).sort({popularity:-1}).limit(8)});}catch(e){next(e);}});
app.get('/api/movies/trending',auth,async(req,res,next)=>{try{res.json({data:await Movie.find().sort({popularity:-1}).limit(12)});}catch(e){next(e);}});
app.get('/api/movies/top-rated',auth,async(req,res,next)=>{try{res.json({data:await Movie.find().sort({externalRating:-1}).limit(12)});}catch(e){next(e);}});
app.get('/api/movies/genres',auth,async(req,res,next)=>{try{res.json({data:await Movie.distinct('genres')});}catch(e){next(e);}});
app.get('/api/movies/:idOrSlug',auth,async(req,res,next)=>{try{const v=req.params.idOrSlug,m=await Movie.findOne({$or:[{slug:v},...(mongoose.isValidObjectId(v)?[{_id:v}]:[])]});if(!m)return res.status(404).json({message:'Movie not found.'});res.json({data:m});}catch(e){next(e);}});
const fields=['title','slug','overview','posterUrl','backdropUrl','trailerUrl','streamUrl','streamLicense','streamProvider','releaseYear','runtime','genres','director','cast','externalRating','voteCount','popularity','featured'];
function clean(b){const o={};for(const k of fields)if(b[k]!==undefined)o[k]=b[k];if(o.title&&!o.slug)o.slug=o.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return o;}
app.post('/api/movies',auth,admin,async(req,res,next)=>{try{res.status(201).json({data:await Movie.create(clean(req.body))});}catch(e){next(e);}});
app.put('/api/movies/:id',auth,admin,async(req,res,next)=>{try{const m=await Movie.findByIdAndUpdate(req.params.id,clean(req.body),{new:true,runValidators:true});if(!m)return res.status(404).json({message:'Movie not found.'});res.json({data:m});}catch(e){next(e);}});
app.delete('/api/movies/:id',auth,admin,async(req,res,next)=>{try{const m=await Movie.findByIdAndDelete(req.params.id);if(!m)return res.status(404).json({message:'Movie not found.'});await Review.deleteMany({movieId:m._id});await Watchlist.updateMany({},{$pull:{movieIds:m._id}});res.json({success:true});}catch(e){next(e);}});
app.get('/api/watchlist',auth,async(req,res,next)=>{try{const w=await Watchlist.findOne({userId:req.user._id}).populate('movieIds');res.json({data:w?.movieIds||[]});}catch(e){next(e);}});
app.post('/api/watchlist/:id',auth,async(req,res,next)=>{try{if(!await Movie.exists({_id:req.params.id}))return res.status(404).json({message:'Movie not found.'});const w=await Watchlist.findOneAndUpdate({userId:req.user._id},{$addToSet:{movieIds:req.params.id}},{new:true,upsert:true});res.json({success:true,data:w});}catch(e){next(e);}});
app.delete('/api/watchlist/:id',auth,async(req,res,next)=>{try{const w=await Watchlist.findOneAndUpdate({userId:req.user._id},{$pull:{movieIds:req.params.id}},{new:true});res.json({success:true,data:w});}catch(e){next(e);}});
app.get('/api/movies/:id/reviews',auth,async(req,res,next)=>{try{const m=await Movie.findOne({$or:[{slug:req.params.id},...(mongoose.isValidObjectId(req.params.id)?[{_id:req.params.id}]:[])]});if(!m)return res.status(404).json({message:'Movie not found.'});const d=await Review.find({movieId:m._id}).populate('userId','name').sort({createdAt:-1});res.json({data:d.map(r=>({id:r._id,rating:r.rating,text:r.text,name:r.userId?.name||'Movie fan',userId:r.userId?._id,createdAt:r.createdAt}))});}catch(e){next(e);}});
app.post('/api/reviews/:movieId',auth,async(req,res,next)=>{try{const rating=Number(req.body.rating),text=String(req.body.text||'').trim();if(!Number.isInteger(rating)||rating<1||rating>5||text.length<2)return res.status(400).json({message:'Provide a 1–5 rating and review text.'});const r=await Review.findOneAndUpdate({userId:req.user._id,movieId:req.params.movieId},{rating,text},{upsert:true,new:true,runValidators:true});res.status(201).json({data:r});}catch(e){next(e);}});
app.get('/api/admin/analytics',auth,admin,async(req,res,next)=>{try{const [movies,users,reviews,watchlists,genres,popular]=await Promise.all([Movie.countDocuments(),User.countDocuments(),Review.countDocuments(),Watchlist.countDocuments(),Movie.aggregate([{$unwind:'$genres'},{$group:{_id:'$genres',count:{$sum:1}}},{$sort:{count:-1}}]),Movie.find().sort({popularity:-1}).limit(5).select('title popularity posterUrl')]);res.json({data:{movies,users,reviews,watchlists,genres,popular}});}catch(e){next(e);}});
app.use((req,res)=>res.status(404).json({message:'API route not found.'}));
app.use((err,req,res,next)=>{console.error(err.message);res.status(err.code===11000?409:500).json({message:err.code===11000?'A record with this value already exists.':(err.status&&err.status<500?err.message:'Server error.')});});
mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/moviebox').then(()=>app.listen(process.env.PORT||5000,()=>console.log('MovieBox API running on http://localhost:'+(process.env.PORT||5000)))).catch(e=>{console.error('MongoDB connection failed:',e.message);process.exit(1);});
