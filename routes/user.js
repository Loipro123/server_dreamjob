const pool = require('../db');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {check,validationResult, body} = require('express-validator');
const multer = require("multer");
const auth = require('../middleware/auth');
const { v4 } =require('uuid');


const {
    ref,
    uploadBytes,
    listAll,
    deleteObject,
    getDownloadURL
  } = require("firebase/storage");
const storage = require("../firebase");

function formatDateStr(dateStr) {
    const date = new Date(dateStr);
    const yearMonthStr = date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit' });
    return yearMonthStr;
  }

function getRandomColor() {
    const hexChars = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += hexChars[Math.floor(Math.random() * 16)];
    }
    return color;
  }
// multer
const memoStorage = multer.memoryStorage();
const upload = multer({ memoStorage });

function formatDate(dateString) {
    const dateObj = new Date(dateString);
    const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
    return formattedDate;
  }
function capitalizeWords(str) {
    // str = str.toLocaleLowerCase();
    return str.replace(/\b\w/g, function(l) {
      return l.toUpperCase();
    });
  }
router.get('/skills',async(req,res)=> {
    try {
        let skills= await pool.query(`select name from skills`);
        let skillList = [];
        for(let i =0; i< skills.rows.length;i++){
            skillList.push(skills.rows[i].name)
        }
        // console.log(skillList)
        res.json({
            skills: skillList
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})

router.get('/jobtitles',async(req,res)=> {
    try {
        let titles= await pool.query(`select title from job_titles`)
        let titleList = [];
        for(let i =0; i< titles.rows.length;i++){
            titleList.push(titles.rows[i].title)
        }
        res.json({
            titles: titleList
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})

router.get('/workplace',async(req,res)=> {
    try {
        let place= await pool.query(`select * from work_place`)
        res.json({
            place: place.rows
        })
    } catch (error) {
        res.status(500).send('Server Errors')
        console.log(error)
    }
})
router.get('/jobtype',async(req,res)=> {
    try {
        let type = await pool.query(`select * from job_type;`)
        res.json({
            types: type.rows
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})


/// signup
function checkPassword(str)
  {
      var re = /^(?=.*\d)(?=.*[!@#$%^&*])(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
      return re.test(str);
  }
router.post('/signup',[
    check('fullname','Name is required')
    .not()
    .isEmpty(),
    check('email','Please include a valid email').isEmail(),
    check(
        'password',
        'Please enter a password with 6 or more charaters'
    ).isLength({min: 6})
],async(req,res)=> {
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({
            error: errors.array()
        });
    }
    const {fullname,email,password,jobtypeid,workplaceid,titles,skills} = req.body;
    if(!checkPassword(password) || jobtypeid < 1 || workplaceid < 1){
        return res.status(400).json({
            error: 'Please check you input value'
        });
    }
    try {
        let checkEmail = await pool.query(`select * from users where email = '${email}'`);
        if (checkEmail.rows.length > 0) {
            return res.status(400).json({
                error: 'Email already used'
            });
          } else {
                const salt = await bcrypt.genSalt(10);
                let hashPass = await bcrypt.hash(password, salt);
                await pool.query(`
                INSERT INTO users (fullname, email, password, workplaceid, jobtypeid)
                VALUES ('${fullname}', '${email}', '${hashPass}', ${workplaceid}, ${jobtypeid})
            `);
            let newUser = await pool.query(` select userid from users where email = '${email}'`);
            let id = newUser.rows[0].userid
            let requireSkill1 = []
            for(let i = 0;i <skills.length ; i++){
                const skill = await pool.query(`select skillid from skills where lower(name) = '${skills[i].trim().toLocaleLowerCase()}';`);
                if(skill.rows.length === 0){
                    await pool.query(`insert into skills (name) values ('${capitalizeWords(skills[i].trim())}')`);
                    const updatetskill = await pool.query(`select skillid from skills where lower(name) = '${skills[i].trim().toLocaleLowerCase()}';`)
                    requireSkill1.push(updatetskill.rows[0].skillid)
                }else{
                    requireSkill1.push(skill.rows[0].skillid)
                }
            }
            const skills1 = []
            for (let i = 0; i<requireSkill1.length; i++) {
                skills1.push(`(${id}, ${requireSkill1[i]})`);
            }
            await pool.query(`
                INSERT INTO user_skill (userid, skillid)
                VALUES ${skills1.join(', ')}
                `);

            let jobtitle = []
                for(let i = 0;i <titles.length ; i++){
                    const title = await pool.query(`select jobid from job_titles where lower(title) = '${titles[i].trim().toLocaleLowerCase()}';`);
                    if(title.rows.length === 0){
                        await pool.query(`insert into job_titles(title) values ('${capitalizeWords(titles[i].trim())}')`);
                        const updatetitle = await pool.query(`select jobid from job_titles where lower(title) = '${titles[i].trim().toLocaleLowerCase()}';`)
                        jobtitle.push(updatetitle.rows[0].jobid)
                    }else{
                        jobtitle.push(title.rows[0].jobid)
                    }
                }
                const titles1 = []
                //
            
                for (let i = 0; i<jobtitle.length; i++) {
                    titles1.push(`(${id}, ${jobtitle[i]})`);
                }
                await pool.query(`
                    INSERT INTO user_job (userid, jobid)
                    VALUES ${titles1.join(', ')}
            `);
            const payload = {
                user: {
                    id: newUser.rows[0].userid,
                    role:'user'
                }
            }
            jwt.sign(
                payload, 
                'dreamjob',
            { expiresIn : 3600},
            (err,token) => {
                if(err) throw err;
                res.json({token: token
                })
            })
        }
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})

//login
router.post('/login',[
    check('email','Please include a valid email').isEmail(),
    check(
        'password',
        'password is required'
    ).exists()
],async (req,res) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({
            error: errors.array()
        });
    }
    
    const {email,password,role} = req.body;

    try {
        // See if user exists
        let checkUser = await pool.query(`select * from users where email = '${email}'`);
        if (checkUser.rows.length === 0) {
            return res.status(400).json({
                error: 'This user is not exist'
            });
        }
        const isMatch = await bcrypt.compare(password,checkUser.rows[0].password);

        if(!isMatch){
            return res.status(400).json({
                error: 'Password is not correct'
            });
        }
        
          // Encrypt password
        const payload = {
            user: {
                id: checkUser.rows[0].userid,
                role: role
            }
        }
        jwt.sign(
            payload, 
            'dreamjob',
        { expiresIn : 3600},
        (err,token) => {
            if(err) throw err;
            res.json({
                token: token
            })
        })
    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
});
//Get user' information
router.get('/userInfor',auth,async (req,res) => {
    const {id,role }= req.user;
    try {
        const userInfor =  await pool.query(`select fullname,email, phonenumber,address,jobalert from users where userid = ${id}`);
        const photoLink =  await pool.query(`SELECT photolink FROM photo WHERE userid = ${id} ORDER BY datecreated DESC LIMIT 1`)
        res.json({
            users:{
                ...userInfor.rows[0],
                ...photoLink.rows[0],
                role
            }
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});



//add userskill
router.post('/userskill',auth,async(req,res)=> {
    const {skillsarray,jobarray,imglink,resumeurl,imgName, resumeName} = req.body;
    const userId = req.user.id;
    const skills = [],jobs = [];
    //
    for (let i = 0; i<skillsarray.length; i++) {
        skills.push(`(${userId}, ${skillsarray[i]})`);
    }
    const querySkill = `
        INSERT INTO user_skill (userid, skillid)
        VALUES ${skills.join(', ')}
        `;
    //
    for (let i = 0; i<jobarray.length; i++) {
        jobs.push(`(${userId}, ${jobarray[i]})`);
    }
    const queryJob = `
        INSERT INTO user_job (userid, jobid)
        VALUES ${jobs.join(', ')}
        `;
    try {
        await pool.query(querySkill);
        await pool.query(queryJob);
        await pool.query(`Insert into photo (photolink,userid,imgtitle) 
        values ('${imglink}',${userId},'${imgName}' )`)
        await pool.query(`Insert into resume (resumelink,userid,resumetitle) 
        values ('${resumeurl}',${userId},'${resumeName}' )`)
        res.json({
            message: "success"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
})
///recruiter

function getFileNameFromFirebaseUrl(url) {
    // Get the last part of the URL after the last slash
    const fileNameWithQueryParams = url.substring(url.lastIndexOf('/') + 1);
    
    // Remove the query parameters (if any) from the file name
    const fileNameWithoutQueryParams = fileNameWithQueryParams.split('?')[0];
    
    // Decode the URL-encoded file name
    const decodedFileName = decodeURIComponent(fileNameWithoutQueryParams);

    const fileNameWithExtension = decodedFileName.split('/')[1].trim();

    const stringExtension = decodedFileName.split('.')[1].trim();
    const allowedExtensions = ['png', 'jpeg', 'gif'];
    let extension = '';
    for (let i = 0; i< allowedExtensions.length; i++) {
        if(stringExtension.includes(allowedExtensions[i])){
            extension = allowedExtensions[i];
            break;
        }
        
    }
    const fileName = fileNameWithExtension.substring(0, fileNameWithExtension.lastIndexOf('.'))+'.'+extension;
    
    return fileName;
  }
router.post('/postjob',auth,
upload.single("pic"),[
    body('address').notEmpty().withMessage('Address is required'),
    body('company').notEmpty().withMessage('Company name is required'),
    body('website').notEmpty().withMessage('Company Website is required'),
    body('workplace').notEmpty().withMessage('Workplace is required').custom((value, { req }) => parseInt(value) > 0).withMessage('Invalid workplace'),
    body('jobtype').notEmpty().withMessage('Job type is required').custom((value, { req }) => parseInt(value) > 0).withMessage('Invalid jobtype'),
    body('description').notEmpty().withMessage('Description Website is required'),
    body('expireDate').notEmpty().withMessage('Expire date is required'),
    body('numHire').notEmpty().withMessage('Num hire is required').custom((value, { req }) => parseInt(value) > 0).withMessage('Invalid number of hire'),
    body('requireSkill').notEmpty().withMessage('Skills is required'),
    body('minSalary').notEmpty().withMessage('Min salary is required').custom((value, { req }) => parseInt(value) > 0).withMessage('Invalid number'),
    body('maxSalary').notEmpty().withMessage('Max salary is required').custom((value, { req }) => parseInt(value) > 0).withMessage('Invalid number'),
    body('email').notEmpty().withMessage('Email is required'),
    check('file').custom((value, { req }) => {
        if (!req.file) {
          throw new Error('File is required');
        }
        return true;
    })
], async (req, res)=> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Error')
      return res.status(400).json({ errors: errors.array() });
    }
    const role = req.user.role;
    if(role==='recruiter'){
        const userId = req.user.id;
        const {title,address, company,website,workplace,jobtype,description,expireDate,numHire,requireSkill,minSalary,maxSalary,email,allowuser} = req.body;
        let logoUrl = '';
        let workplace1 = parseInt(workplace);
        let jobtype1 = parseInt(jobtype);
        let title1 = 0;
        let numHire1 = parseInt(numHire);
        let minSalary1 = parseInt(minSalary);
        let maxSalary1 = parseInt(maxSalary);
        let allowuser1 = true
        if(allowuser==='false'){
            allowuser1=false
        }
        const requireSkill2 = requireSkill.split(',');
        const file = req.file;
        let fileName = file.originalname;
        const imageRef = ref(storage, `logos/${file.originalname + v4()}`);
        const metatype = { contentType: file.mimetype, name: file.originalname };
        const dateObj = new Date(expireDate);
        const escapedString = description.replace(/'/g, "\\'");

        let requireSkill1  = [];
        try {
            for(let i = 0;i < requireSkill2.length ; i++){
                const skill = await pool.query(`select skillid from skills where lower(name) = '${requireSkill2[i].trim().toLocaleLowerCase()}';`);
                if(skill.rows.length === 0){
                    await pool.query(`insert into skills (name) values ('${capitalizeWords(requireSkill2[i].trim())}')`);
                    const updatetskill = await pool.query(`select skillid from skills where lower(name) = '${requireSkill2[i].trim().toLocaleLowerCase()}';`)
                    requireSkill1.push(updatetskill.rows[0].skillid)
                }else{
                    requireSkill1.push(skill.rows[0].skillid)
                }
            }
            const titles = await pool.query(`select * from job_titles where lower(title) = '${title.trim().toLocaleLowerCase()}';`)
            if(titles.rows.length > 0){
                title1 = titles.rows[0].jobid
    
            }else{
                await pool.query(`insert into job_titles (title) values ('${capitalizeWords(title.trim())}')`);
                const updatetitles = await pool.query(`select * from job_titles where lower(title) = '${title.trim().toLocaleLowerCase()}';`)
                title1 = updatetitles.rows[0].jobid
            }
            const snapshot = await uploadBytes(imageRef, file.buffer, metatype);
            const url = await getDownloadURL(snapshot.ref);
            logoUrl = url;
          } catch (error) {
            console.log(error.message);
          }
        //// Insert into table company
        try {
            await pool.query(`
            INSERT INTO company (companyname,userid,companywebsite,filename,companylogo)
            VALUES ('${company}', ${userId},'${website}', '${logoUrl}', '${fileName}')
            `);
            const companyId =  await pool.query(`SELECT companyid FROM company
            WHERE userid = ${userId} AND timecreated = (
                SELECT MAX(timecreated)
                FROM company
                WHERE userid = ${userId}
            );`);
            await pool.query(`
            INSERT INTO post (userid,jobid,companyid, jobtypeid, workplaceid,jobaddress , jobdescription, positions, highsalary, lowsalary ,recruiteremail, applicationdeadline,allowusernumber)
            VALUES (${userId}, ${title1}, ${companyId.rows[0].companyid}, ${jobtype1},${workplace1},'${address}',E'${escapedString}',${numHire1},${maxSalary1},${minSalary1},'${email}','${dateObj.toUTCString()}',${allowuser1})
            `);
            const postId =  await pool.query(`SELECT postid FROM post
            WHERE userid = ${userId} AND datecreated = (
                SELECT MAX(datecreated)
                FROM post
                WHERE userid = ${userId}
            );`);
            const skills = []
            //
            for (let i = 0; i<requireSkill1.length; i++) {
                skills.push(`(${postId.rows[0].postid}, ${requireSkill1[i]})`);
            }
            await pool.query(`
                INSERT INTO job_skill (postid, skillid)
                VALUES ${skills.join(', ')}
                `);
            res.json({
                    message: "success"
            })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})


//switch
router.get('/switch',auth,async(req,res)=> {
    const userId = req.user.id;
    try {
          // Encrypt password
        const payload = {
            user: {
                id: userId,
                role: 'user'
            }
        }
        jwt.sign(
            payload, 
            'dreamjob',
        { expiresIn : 3600},
        (err,token) => {
            if(err) throw err;
            res.json({
                token: token
            })
        })
    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
})
//missingskill
router.get('/missingskills',auth,async(req,res)=> {
    const userId = req.user.id;
    const { postid } = req.query;
    try {
          // Encrypt password
        let user_skills = await pool.query(`select name from skills where skillid in (select skillid from user_skill where userid = ${userId});`)
        let job_skills =  await pool.query(`select name from skills where skillid in (select skillid from job_skill where postid = ${postid});`)

        const total_skill = job_skills.rows.length;
        let missing_list = [];
        let match_list = [];
        let miss_count = 0;
        for(let i = 0; i< job_skills.rows.length; i++){
            let check = false;
            for(let j=0;j< user_skills.rows.length; j++){
                if(job_skills.rows[i].name===user_skills.rows[j].name){
                    check = true;
                    break;
                }
            }
            if(check===false){
                missing_list.push(job_skills.rows[i].name);
                miss_count = miss_count + 1;
            }else{
                match_list.push(job_skills.rows[i].name)
            }
        }
        res.json({
            missing: {
                miss_list: missing_list,
                match_list: match_list,
                count_match: total_skill - miss_count,
                total: total_skill
            }
        })

    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
})

router.get('/posts',auth,async(req,res)=> {
    const userId = req.user.id;
    try {
          // Encrypt password
        let posts = await pool.query(`
        SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.jobid,p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where p.jobid in (select jobid from user_job where userid = ${userId}) and ((p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false))
        ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.jobid
         order by k.datecreated desc;`);
         let posts_order = {
            onsite: [],
            remote: [],
            hybrid: []
        }
        for(let i =0;i< posts.rows.length;i++){
            if(posts.rows[i].workplaceid ===1){
                posts_order.onsite.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }else if(posts.rows[i].workplaceid ===2){
                posts_order.remote.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }else{
                posts_order.hybrid.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
            }
        }
        res.json({
            posts: posts_order
        })
    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
})

function getDayDiff(dateString) {
    const givenDate = new Date(dateString);
    const currentDate = new Date();
    const timeDiffInMs = currentDate.getTime() - givenDate.getTime();
    const dayDiff = Math.floor(timeDiffInMs / (24 * 60 * 60 * 1000));
    if(dayDiff === -1){
        return 0
    }
    return dayDiff;
  }

  function getLastTwoElements(str) {
    const arr = str.split(',');
    const lastTwoElements = arr.slice(-2);
    const result = lastTwoElements.join(',');
    return result.trim();
  }





//switch
router.get('/portfolio',auth,async(req,res)=> {
    const userId = req.user.id;
    try {
        const usrInfo = await pool.query(`select k.*, p.photolink from (select userid, email,fullname,phonenumber,address,jobalert from users u
            where u.userid = ${userId}
            ) k inner join photo p on
            k.userid = p.userid 
            order by p.datecreated desc
            limit 1
            ;`);
        const skills = await pool.query(`select name from skills where skillid in (select skillid from user_skill where userid = ${userId});`);
        const jobtitle = await pool.query(`select title from job_titles where jobid in (select jobid from user_job where userid = ${userId});`);
        const resume = await pool.query(`select * from resume where userid = ${userId} order by datecreated desc;`);
        let skill_list = [];
        let title_list = [];
        for(let i =0; i< skills.rows.length; i++){
            skill_list.push(skills.rows[i].name)
        }
        for(let i =0; i< jobtitle.rows.length; i++){
            title_list.push(jobtitle.rows[i].title)
        }
        res.json({
           user: {
               ...usrInfo.rows[0],
               skill_list: skill_list,
               title_list : title_list,
               resume: resume.rows
           }
        })
    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
})

//switch
router.get('/userpost',auth,async(req,res)=> {
    const userId = req.user.id;
    let posts = []
    try {
        const postInFo = await pool.query(`select a.applicationid,a.postid,a.applied,a.applydate,a.saved,a.savedate,a.interviewed,a.offer,a.allowuserview,a.recruiterview,a.cancelapply,a.usernotes,p.jobaddress,t.title 
        from (select * from applications where userid = ${userId}) a inner join post p
        on a.postid = p.postid inner join job_titles t
        on p.jobid = t.jobid
        order by a.applydate desc;`);
        for(let i=0; i< postInFo.rows.length; i++){
            posts.push({
                ...postInFo.rows[i],
                jobaddress: getLastTwoElements(postInFo.rows[i].jobaddress),
                applydate: postInFo.rows[i].applydate !== null ? formatDate(postInFo.rows[i].applydate) :  postInFo.rows[i].applydate,
                savedate: postInFo.rows[i].savedate !== null ? formatDate(postInFo.rows[i].savedate) :  postInFo.rows[i].savedate,
                recruiterview: postInFo.rows[i].recruiterview !== null ? formatDate(postInFo.rows[i].recruiterview) :  postInFo.rows[i].recruiterview
            })
        }
        res.json({
           posts: posts
        })
    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
})

router.get('/usergraph',auth,async(req,res)=> {
    const userId = req.user.id;
    try {
        let graphPost = [];
        const userJob = await pool.query(` select title,jobid from job_titles where jobid in (select jobid from user_job where userid = ${userId});`)
        for(let i=0;i< userJob.rows.length; i++){
            const postInFo = await pool.query(`SELECT
                    DATE_TRUNC('month', months.month) AS month,
                    COALESCE(COUNT(posts.postid), 0) AS post_count
                FROM
                    (SELECT generate_series(DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York' - INTERVAL '11 months'),
                                            DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York'), '1 month') AS month) AS months
                LEFT JOIN
                    post AS posts ON DATE_TRUNC('month', posts.datecreated) = DATE_TRUNC('month', months.month) AND posts.jobid = ${userJob.rows[i].jobid}
                GROUP BY
                    DATE_TRUNC('month', months.month)
                ORDER BY
                    month ASC;`);
                    graphPost.push({
                        color:getRandomColor(),
                        title:userJob.rows[i].title,
                        postsdata: postInFo.rows.map(item => parseInt(item.post_count)),
                        lable: postInFo.rows.map(item => formatDateStr(item.month)
                           )
                    })
            }
        let series = [];
        let colors = [];
        let categories = [];
        for(let i=0;i< graphPost.length; i++){
            series.push({
                name: graphPost[i].title,
                data:graphPost[i].postsdata
            })
            colors.push(graphPost[i].color)
            categories = graphPost[i].lable
        }

           
        res.json({
           series,
           colors,
           categories
        })
    } catch (error) {
        console.log(error.message)
        res.status(500).send('Server error')
    }
})


router.post('/updatephoto',auth,
upload.single("pic"),[
    check('file').custom((value, { req }) => {
        if (!req.file) {
          throw new Error('File is required');
        }
        return true;
    })
], async (req, res)=> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Error')
      return res.status(400).json({ errors: errors.array() });
    }
    const {id,role }= req.user;
    if(role==='user'){
        const file = req.file;
        let fileName = file.originalname;
        const imageRef = ref(storage, `logos/${file.originalname + v4()}`);
        const metatype = { contentType: file.mimetype, name: file.originalname };
        const snapshot = await uploadBytes(imageRef, file.buffer, metatype);
        const url = await getDownloadURL(snapshot.ref);
        try {
            await pool.query(`Insert into photo (photolink,userid,imgtitle) 
            values ('${url}',${id},'${fileName}' )`);
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
        }
       
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})
router.post('/updateresume',auth,
upload.single("resume"),[
    check('file').custom((value, { req }) => {
        if (!req.file) {
          throw new Error('File is required');
        }
        return true;
    })
], async (req, res)=> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Error')
      return res.status(400).json({ errors: errors.array() });
    }
    const {id,role }= req.user;
    if(role==='user'){
        const file = req.file;
        let fileName = file.originalname;
        const imageRef = ref(storage, `pdfs/${file.originalname + v4()}`);
        const metatype = { contentType: file.mimetype, name: file.originalname };
        const snapshot = await uploadBytes(imageRef, file.buffer, metatype);
        const url = await getDownloadURL(snapshot.ref);
        try {
            await pool.query(`UPDATE resume
            SET choose = false
            WHERE userid = ${id};`)
            await pool.query(`Insert into Resume (resumelink,userid,resumetitle) 
            values ('${url}',${id},'${fileName}' )`);
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})

router.post('/updateresumechoose',auth,
 async (req, res)=> {
    const {id,role }= req.user;
    const {resumeid} = req.body;
    if(role==='user'){
        try {
            await pool.query(`UPDATE resume
            SET choose = false
            WHERE userid = ${id};`)
            await pool.query(`UPDATE resume
            SET choose = true
            WHERE resumeid = ${resumeid};`)
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})


router.post('/updateuserinfo',auth,
 async (req, res)=> {
    const {id,role }= req.user;
    const {skills,titles,jobalert,email,phone,address} = req.body;
    if(role==='user'){
        try {
            let requireSkill1 = []
            for(let i = 0;i <skills.length ; i++){
                const skill = await pool.query(`select skillid from skills where lower(name) = '${skills[i].trim().toLocaleLowerCase()}';`);
                if(skill.rows.length === 0){
                    await pool.query(`insert into skills (name) values ('${capitalizeWords(skills[i].trim())}')`);
                    const updatetskill = await pool.query(`select skillid from skills where lower(name) = '${skills[i].trim().toLocaleLowerCase()}';`)
                    requireSkill1.push(updatetskill.rows[0].skillid)
                }else{
                    requireSkill1.push(skill.rows[0].skillid)
                }
            }
            const skills1 = []
            //
            await pool.query(`
            DELETE FROM user_skill WHERE userid = ${id};
                `)

            for (let i = 0; i<requireSkill1.length; i++) {
                skills1.push(`(${id}, ${requireSkill1[i]})`);
            }
            await pool.query(`
                INSERT INTO user_skill (userid, skillid)
                VALUES ${skills1.join(', ')}
                `);

            let jobtitle = []
                for(let i = 0;i <titles.length ; i++){
                    const title = await pool.query(`select jobid from job_titles where lower(title) = '${titles[i].trim().toLocaleLowerCase()}';`);
                    if(title.rows.length === 0){
                        await pool.query(`insert into job_titles(title) values ('${capitalizeWords(titles[i].trim())}')`);
                        const updatetitle = await pool.query(`select jobid from job_titles where lower(title) = '${titles[i].trim().toLocaleLowerCase()}';`)
                        jobtitle.push(updatetitle.rows[0].jobid)
                    }else{
                        jobtitle.push(title.rows[0].jobid)
                    }
                }
                const titles1 = []
                //
                await pool.query(`
                DELETE FROM user_job WHERE userid = ${id};
                    `)
    
                for (let i = 0; i<jobtitle.length; i++) {
                    titles1.push(`(${id}, ${jobtitle[i]})`);
                }
                await pool.query(`
                    INSERT INTO user_job (userid, jobid)
                    VALUES ${titles1.join(', ')}
                    `);

                await pool.query(`UPDATE users
                    SET jobalert = ${jobalert},email='${email}',phonenumber='${phone}',address='${address}'
                    WHERE userid = ${id};`)
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})


router.post('/userhistoryinterviewed',auth,
 async (req, res)=> {
    const {id,role }= req.user;
    const {interviewed,applicationid} = req.body;
    if(role==='user'){
        try {
            await pool.query(`UPDATE applications
            SET interviewed = ${interviewed}
            WHERE userid = ${id} and applicationid=${applicationid};`)
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})

router.post('/userhistoryoffer',auth,
 async (req, res)=> {
    const {id,role }= req.user;
    const {offered,applicationid} = req.body;
    if(role==='user'){
        try {
            await pool.query(`UPDATE applications
            SET offer = ${offered}
            WHERE userid = ${id} and applicationid=${applicationid};`)
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }

})

router.post('/userhistorynote',auth,
 async (req, res)=> {
    const {id,role }= req.user;
    const {notes,applicationid} = req.body;
    if(role==='user'){
        try {
            await pool.query(`UPDATE applications
            SET usernotes = '${notes}'
            WHERE userid = ${id} and applicationid=${applicationid};`)
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }
})

router.post('/userhistorydelete',auth,
 async (req, res)=> {
    const {id,role }= req.user;
    const {applicationid} = req.body;
    if(role==='user'){
        try {
            await pool.query(`UPDATE applications
            SET cancelapply = true
            WHERE userid = ${id} and applicationid=${applicationid};`)
            res.json({
                msg: "success"
             })
        } catch (error) {
            res.status(500).send('Server Errors')
            console.log(error)
        }
    }
    else{
        res.status(500).send('Server Errors')
        console.log(errors)
    }
})

module.exports = router;