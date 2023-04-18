const pool = require('../db');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {check,validationResult, body} = require('express-validator');
const multer = require("multer");
const auth = require('../middleware/auth');
const { v4 } =require('uuid');

function returnCurrentdate (){
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset(); // Get current timezone offset in minutes
    const adjustedDate = new Date(now.getTime() - (timezoneOffset * 60 * 1000)); // Subtract the timezone offset in milliseconds
    return adjustedDate
}

//Get post' information
router.get('/postInfor',auth,async (req,res) => {

    const {id,role }= req.user;
    try {
        const jobid =  await pool.query(`SELECT postid,jobid,datecreated,applicationdeadline,allowuserview,viewcount,delete,deletedate,allowuserexpired FROM post WHERE userid = ${id} ORDER BY datecreated DESC`)
        let posts = [];
        const jobtitles = jobid.rows;
        for(let i =0;i< jobtitles.length; i++){
            const jobid =  await pool.query(`SELECT title FROM job_titles WHERE jobid= ${jobtitles[i].jobid}`);
            const applyCount =  await pool.query(`Select count(*) from applications where postid= ${jobtitles[i].postid} and applied = true;`);
            const saveCount =  await pool.query(`Select count(*) from applications where postid= ${jobtitles[i].postid} and saved = true;`);
            const users = await pool.query(`select * from (select u.userid, u.fullname,s.applydate,s.recruitermsg,s.cancelapply from applications s inner join users u on s.userid = u.userid where s.postid=${jobtitles[i].postid} and s.applied = true) p inner join (select userid,resumelink from resume
                where choose = true) k on p.userid = k.userid;`)
            posts.push({
                postid:jobtitles[i].postid,
                title: jobid.rows[0].title,
                allowuserexpired:jobtitles[i].allowuserexpired,
                datecreated: jobtitles[i].datecreated,
                expiredate:jobtitles[i].applicationdeadline,
                applycount: applyCount.rows[0].count,
                savecount: saveCount.rows[0].count,
                allowuserview: jobtitles[i].allowuserview,
                viewcount: jobtitles[i].viewcount,
                delete: jobtitles[i].delete,
                deletedate: jobtitles[i].deletedate,
                users: users.rows
            })
        }
        res.json({
            posts: posts
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});


router.post('/deletePost',auth,async (req,res) => {
    const {postid} = req.body;
    try {
        await pool.query(`UPDATE post SET delete = true, deletedate = '${returnCurrentdate().toUTCString()}' WHERE postid = ${postid};`);
        res.json({
            message: "sucess"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});

router.post('/allowview',auth,async (req,res) => {
    const {check,postid} = req.body;
    try {
        await pool.query(`UPDATE post SET allowuserview = ${!check} WHERE postid = ${postid};`);
        await pool.query(`UPDATE applications SET allowuserview = ${!check} WHERE postid = ${postid};`);
        res.json({
            message: "sucess"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});

router.post('/allowuserexpired',auth,async (req,res) => {
    const {check,postid} = req.body;
    try {
        await pool.query(`UPDATE post SET allowuserexpired = ${!check} WHERE postid = ${postid};`);
        res.json({
            message: "sucess"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});


router.post('/currentview',auth,async (req,res) => {
    const {postid} = req.body;
    try {
        await pool.query(`UPDATE post SET lastestrecruiterview = '${returnCurrentdate().toUTCString()}', notification = ${false}  WHERE postid = ${postid};`);
        res.json({
            message: "sucess"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});
router.post('/currentuserview',auth,async (req,res) => {
    const {userid,postid} = req.body;
    try {
        await pool.query(`UPDATE applications SET recruiterview = '${returnCurrentdate().toUTCString()}' WHERE postid = ${postid} and userid = ${userid};`);
        res.json({
            message: "sucess"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});

router.post('/updateviewcount',async (req,res) => {
    const {postid} = req.body;
    try {
        await pool.query(`UPDATE post
        SET viewcount = viewcount + 1
        WHERE postid = ${postid};`);
        res.json({
            message: "sucess"
        })
    } catch (error) {
        res.status(500).send('Serve Error')
    }
});

router.get('/notification',auth,async (req,res) => {
    const {id }= req.user;
    try {
        const notification = await pool.query(`select p.postid,t.title from job_titles t inner join post p on t.jobid = p.jobid  where p.notification = true and p.userid=${id} and p.delete=false;
        `);
        res.json({
            note: notification.rows
        })
    } catch (error) {
        res.status(500).send('Serve Error')
        console.log(error)
    }
});

router.get('/updatenotification',auth,async (req,res) => {
    const {id }= req.user;
    const {postid} = req.query;
    try {
        await pool.query(`UPDATE post SET notification = ${false} WHERE postid = ${postid} and userid = ${id};
        `);
        res.json({
            msg: 'success'
        })
    } catch (error) {
        res.status(500).send('Serve Error')
        console.log(error)
    }
});


module.exports = router;