const pool = require('../db');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {check,validationResult, body} = require('express-validator');
const multer = require("multer");
const auth = require('../middleware/auth');
const { v4 } =require('uuid');


router.get('/titles',async(req,res)=> {
    try {
        let titles= await pool.query(`SELECT DISTINCT jobid, title FROM job_titles WHERE jobid IN (SELECT jobid FROM post p where (p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)) limit 5`)
        res.json({
            titles: titles.rows
        })
    } catch (error) {
        res.status(500).send('Server Errors')
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
router.get('/posts',async(req,res)=> {
    try {
        let posts= await pool.query(`SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview, c.companyname,c.filename,t.title
          FROM post p
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
          order by p.datecreated desc
        ) k
        LEFT JOIN applications a
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid
        order by k.datecreated desc;
        `)
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
        res.status(500).send('Server Errors')
    }
})


router.get('/details',async(req,res)=> {
    try { 
        const { postid } = req.query;
        let skills= await pool.query(`select * from skills where skillid in (select skillid from job_skill where postid = ${postid});`)
        
        let jobids = await pool.query(`select jobid from post where postid=${postid};`)
        
        let posts = await pool.query(`SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription,p.allowusernumber,p.positions,p.applicationdeadline, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (p.jobid = ${jobids.rows[0].jobid} and p.postid != ${postid} and p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (p.jobid = ${jobids.rows[0].jobid} and p.postid != ${postid} and p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false)
          order by p.datecreated desc
        ) k
        LEFT JOIN applications a      
        ON k.postid = a.postid 
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.allowusernumber,k.positions,k.applicationdeadline
        order by k.datecreated desc;
        `)
        let posts_order = []
        for(let i =0;i< posts.rows.length;i++){
                posts_order.push({
                    ...posts.rows[i],
                    datecreated: getDayDiff(posts.rows[i].datecreated) === 0 ? 'Today' : getDayDiff(posts.rows[i].datecreated) + ' days',
                    jobaddress: getLastTwoElements(posts.rows[i].jobaddress),
                    lastestrecruiterview: getDayDiff(posts.rows[i].lastestrecruiterview) === 0 ? 'today' : getDayDiff(posts.rows[i].lastestrecruiterview) + ' days'
                })
        }

        let detail = await pool.query(`SELECT k.*, COUNT(a.postid) AS num_applications
        FROM (
          SELECT p.workplaceid,p.jobaddress,p.postid,p.datecreated,p.lastestrecruiterview,p.allowuserview,p.jobdescription,p.allowusernumber,p.positions,p.applicationdeadline, c.companyname,c.filename,t.title
          FROM post p 
          INNER JOIN company c
          ON p.companyid = c.companyid
          inner join job_titles t
          On p.jobid = t.jobid
          where (postid = ${postid} and p.delete = false and p.applicationdeadline >= NOW() AT TIME ZONE 'America/New_York') or (postid = ${postid} and p.delete = false and p.applicationdeadline < NOW() AT TIME ZONE 'America/New_York' and p.allowuserexpired = false) 
          order by p.datecreated desc
        ) k
        LEFT JOIN (select * from applications where applied = true) a      
        ON k.postid = a.postid
        GROUP BY k.postid,k.jobaddress, k.companyname,k.datecreated,k.filename,k.title,k.lastestrecruiterview,k.allowuserview,k.workplaceid,k.jobdescription,k.allowusernumber,k.positions,k.applicationdeadline;`)
        res.json({
            skills: skills.rows,
            posts:posts_order,
            detail: {
                ...detail.rows[0],
                datecreated: getDayDiff(detail.rows[0].datecreated) === 0 ? 'Today' : getDayDiff(detail.rows[0].datecreated) + ' days ago',
                jobaddress: getLastTwoElements(detail.rows[0].jobaddress),
                lastestrecruiterview: getDayDiff(detail.rows[0].lastestrecruiterview) === 0 ? 'today' : getDayDiff(detail.rows[0].lastestrecruiterview) + ' days ago'
            }
        })
    } catch (error) {
        res.status(500).send('Server Errors')
    }
})


module.exports = router;