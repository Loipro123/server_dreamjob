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
// multer
const memoStorage = multer.memoryStorage();
const upload = multer({ memoStorage });



function capitalizeWords(str) {
    // str = str.toLocaleLowerCase();
    return str.replace(/\b\w/g, function(l) {
      return l.toUpperCase();
    });
  }
router.get('/edit',auth, async(req,res)=> {
    const userId = req.user.id;
    const { postid } = req.query;
    const jobdetail = {
        title : '',
        address: '',
        company:'',
        website:'',
        file:null,
        workplace:-1,
        jobtype: -1,
        description: '',
        expireDate: new Date(),
        numHire: 1,
        requireSkill: [],
        minSalary: 0,
        maxSalary: 0,
        email: '',
        allowuser: true,
        filename: null,
        postid: -1,
        companyid: -1
    }
    try {
        const post = await pool.query(`select userid from post where postid = ${postid};`);
        if(userId !== post.rows[0].userid){
            res.status(500).send('Not authentication')
        }
        const postdetail = await pool.query(`select jobaddress,recruiteremail,workplaceid,jobtypeid,jobdescription,applicationdeadline,positions,lowsalary,highsalary,allowusernumber from post where postid = ${postid};`);
        jobdetail.address = postdetail.rows[0].jobaddress;
        jobdetail.workplace = postdetail.rows[0].workplaceid;
        jobdetail.jobtype = postdetail.rows[0].jobtypeid;
        jobdetail.description = postdetail.rows[0].jobdescription;
        jobdetail.expireDate = new Date(postdetail.rows[0].applicationdeadline);
        jobdetail.numHire = postdetail.rows[0].positions;
        jobdetail.minSalary = parseInt(postdetail.rows[0].lowsalary);
        jobdetail.maxSalary = parseInt(postdetail.rows[0].highsalary);
        jobdetail.allowuser = postdetail.rows[0].allowusernumber;
        jobdetail.email = postdetail.rows[0].recruiteremail
        const companydetail = await pool.query(`select companyid,companyname, companywebsite, companylogo from company where companyid in (select companyid from post where postid = ${postid});
        `);
        jobdetail.company = companydetail.rows[0].companyname;
        jobdetail.website = companydetail.rows[0].companywebsite;
        jobdetail.filename = companydetail.rows[0].companylogo;
        jobdetail.companyid = companydetail.rows[0].companyid;

        const skills = await pool.query(`select name from skills where skillid in (select skillid from job_skill where postid = ${postid});`);
        for(let i = 0; i< skills.rows.length; i++){
            jobdetail.requireSkill.push(skills.rows[i].name)
        }
        const titles = await pool.query(`select title from job_titles where jobid in (select jobid from post where postid = ${postid});`);
        jobdetail.title = titles.rows[0].title;
        jobdetail.postid = parseInt(postid);
        res.json({
            detail: jobdetail
        })
    } catch (error) {
        console.log(error)
        res.status(500).send('Serve Error')
    }
})

router.get('/isapply',auth,async(req,res)=> {
    const { postid } = req.query;
    const userId = req.user.id;
    //
    // console.log(postid,rescruitermsg,userId)

    try {
        const isapply = await pool.query(`select applied,saved from applications where postid=${postid} and userid=${userId};`);
        if(isapply.rows.length == 0){
            res.json({
                apply: false,
                save: false
            })
        }else{
            res.json({
                apply: isapply.rows[0].applied,
                save: isapply.rows[0].saved
            })
        }
    } catch (error) {
        res.status(500).send('Serve Error')
    }
})

router.post('/save',auth,async(req,res)=> {
    const {postid} = req.body;
    const userId = req.user.id;
    //
    // console.log(postid,rescruitermsg,userId)

    try {
        const application = await pool.query(`select applicationid from applications where postid=${postid} and userid=${userId};`);
        if(application.rows.length == 0){
            await pool.query(`Insert into applications (userid,postid,saved,savedate) 
            values (${userId},${postid},${true},'${new Date().toUTCString()}')`)
        }else{
            await pool.query(`UPDATE applications SET saved = ${true}, savedate = '${new Date().toUTCString()}' WHERE applicationid=${application.rows[0].applicationid};`)
        }
        
        res.json({
            message: "success"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
})

router.post('/apply',auth,async(req,res)=> {
    const {postid,rescruitermsg} = req.body;
    const userId = req.user.id;
    //
    // console.log(postid,rescruitermsg,userId)
    const escapedString = rescruitermsg.replace(/'/g, "\\'");

    try {
        const application = await pool.query(`select applicationid from applications where postid=${postid} and userid=${userId};`);
        if(application.rows.length == 0){
            await pool.query(`Insert into applications (userid,postid,applied,applydate,recruitermsg) 
            values (${userId},${postid},${true},'${new Date().toUTCString()}',E'${escapedString}' )`)
        }else{
            await pool.query(`UPDATE applications SET applied = ${true}, applydate = '${new Date().toUTCString()}', recruitermsg=E'${escapedString}' WHERE applicationid=${application.rows[0].applicationid};`)
        }
            await pool.query(`UPDATE post SET notification = ${true} WHERE postid=${postid};`)

        res.json({
            message: "success"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
})


router.post('/editpost',auth,
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
    body('email').notEmpty().withMessage('Email is required')
], async (req, res)=> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const role = req.user.role;
    if(role==='recruiter'){
        const userId = req.user.id;
        const {title,address, company,website,workplace,jobtype,description,expireDate,numHire,requireSkill,minSalary,maxSalary,email,allowuser,postid,companyid} = req.body;
        let logoUrl = '';
        let workplace1 = parseInt(workplace);
        let jobtype1 = parseInt(jobtype);
        let title1 = 0;
        let numHire1 = parseInt(numHire);
        let minSalary1 = parseInt(minSalary);
        let maxSalary1 = parseInt(maxSalary);
        let allowuser1 = true;
        let postidUser = parseInt(postid);
        let companyid1 = parseInt(companyid)
        if(allowuser==='false'){
            allowuser1=false
        }
        const requireSkill2 = requireSkill.split(',');
        let file,fileName,imageRef,metatype;
        if(req.file!== undefined){
            file = req.file;
            fileName = file.originalname;
            imageRef = ref(storage, `logos/${file.originalname + v4()}`);
            metatype = { contentType: file.mimetype, name: file.originalname };
        }
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
            let snapshot, url;
            if(req.file!== undefined){
                snapshot = await uploadBytes(imageRef, file.buffer, metatype);
                url = await getDownloadURL(snapshot.ref);
                logoUrl = url;
            }
          } catch (error) {
            console.log(error.message);
          }
        //// Insert into table company
        try {
            if(req.file !== undefined){
            await pool.query(`
            UPDATE company 
            SET companyname = '${company}', companywebsite = '${website}', filename = '${logoUrl}', companylogo = '${fileName}' 
            WHERE companyid = ${companyid1};
            `);
            }else{
                await pool.query(`
                UPDATE company 
                SET companyname = '${company}',  companywebsite = '${website}'
                WHERE companyid = ${companyid1};
                `);
            }
            await pool.query(`
            UPDATE post 
                SET jobid = ${title1}, jobtypeid = ${jobtype1}, workplaceid = ${workplace1}, jobaddress = '${address}', jobdescription = E'${escapedString}', positions = ${numHire1}, highsalary = ${maxSalary1}, lowsalary = ${minSalary1}, recruiteremail = '${email}', applicationdeadline = '${dateObj.toUTCString()}', allowusernumber = ${allowuser1}
                WHERE postid = ${postidUser};`);
            const skills = []
            //
            await pool.query(`
            DELETE FROM job_skill WHERE postid = ${postidUser};
                `)

            for (let i = 0; i<requireSkill1.length; i++) {
                skills.push(`(${postidUser}, ${requireSkill1[i]})`);
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




module.exports = router;