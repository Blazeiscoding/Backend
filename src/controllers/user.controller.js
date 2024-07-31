import {asyncHandler} from "../utils/asyncHandler.js"
import {apiError} from "../utils/apiError.js"
import {User} from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { apiResponse } from "../utils/apiResponse.js" 
import mongoose, { skipMiddlewareFunction } from "mongoose"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async(userId)=>{
    try {
    const user = await User.findById(userId)
    const accessToken = user.generateAccessToken()
    const refreshToken = user.genereteRefreshToken()
    user.refreshToken = refreshToken
    await user.save({validateBeforeSave : false})

    return { accessToken , refreshToken}


    } catch (error) {
        throw new apiError(500 , " Something went wrong while generating refresh and access token"
        )
    }
}


const registerUser = asyncHandler( async (req,res) => {
    res.status(200).json({
        message: "chai aur code"
    })


    // get user details from frontend
    // validation -not empty
    // check if user already exists : username , emails
    // check for images , check for avatar
    // upload them to cloudinary , avatar(check)
    // create user object - create entry in db 
    // remove password and refresh token field from response
    // check for user creation 
    // return response

    const {fullName , email , username , password } = req.body
    console.log("email : ", email);

    // if (fullName === ""){
    //     throw new apiError(400, "fullName is Required")
    // }

    if (
        [fullName , email,username,password].some((field)=> field?.trim() === "")) 
        {
            throw new apiError(400, "All fields are required")
        } 

    const existedUser= await User.findOne({
        $or: [ {username} , { email }]
    })

    if(existedUser){
        throw new apiError(409 , " User with email or username exists")
    }

    console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path

    // const coverImageLocalPath = req.files?.coverImage[0]?.path

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage)&& req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new apiError(400 , "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar){
        throw new apiError(400 , "Avatar file is required")
    }


    const user = await User.create({
        fullName,
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
        email,
        password,
        username : username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new apiError ( 500 , "Something went wrong while registering the User")
    }

    return res.status(201).json(
        new apiResponse(200 , createdUser , "User registered successfully")
    )

} )

const loginUser = asyncHandler (async (req,res)=>{
    // req body -> data
    // username or email
    // find the user
    // check password
    // access and refresh token
    // send cookies
    // send response 
    
    
    const {email , username , password} = req.body

    if (!(username || email)){
        throw new apiError(400 , "username or password is required ")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if (!user){
        throw new apiError(404,"User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid){
        throw new apiError(404,"Invaild user credentials")
    }


    const {accessToken , refreshToken} = await generateAccessAndRefreshToken(user._id)
    
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly : true,
        secure : true,
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken , options)
    .cookie("refreshToken", refreshToken , options)
    .json(
        new apiResponse(
            200,
            {
                user : loggedInUser , accessToken , refreshToken
            },
            "User logged in SuccessFully"
        )
    )


})


const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,{
            $set : {refreshToken : undefined}
        },
        {
            new:true
        }
    )
    const options = {
        httpOnly : true,
        secure : true,
    }
    return res
    .status(200)
    .clearCookie("accessToken" , options)
    .clearCookie("refreshToken" , options)
    .json(new apiResponse(200 , {}," User logged Out"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if( !incomingRefreshToken){
        throw new apiError(401,"unauthorized request")

    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
        if( !user){
            throw new apiError(401,"Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken){
            throw new apiError(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly : true,
            secure : true,
        }
    
        const {accessToken, newrefreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken,options)
        .cookie("refresh token", newrefreshToken,options)
        .json(
            new apiResponse(
                200,
                {accessToken, refreshToken : newrefreshToken},
                "Access Token refreshed"
            )
        )
    } catch (error) {
        throw new apiError(401 , error?.message || "Invalid refresh token " )
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword , newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new apiError(400 , "InValid Old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new apiResponse(200 , { }, "Password Changed Successfully"))
    
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(200,req.user,"Current User Fetched Successfully")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const{fullName,email} = req.body

    if (!(fullName || email)){
        throw new apiError(400,"All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName,
                email
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new apiResponse(200,user, "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async(req,res)=>{

    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new apiError(400 , "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new apiError(400,"Error while uploading on avatar")

    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar : avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiResponse(200 , user, "Avatar updated successfully")
    )

})

const updateUserCoverImage = asyncHandler(async(req,res)=>{

    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new apiError(400 , "coverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new apiError(400,"Error while uploading on coverImage")

    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage : coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiResponse(200 , user, "Cover Image updated successfully")
    )

})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const {username}= req.params

    if(!username?.trim()){
        throw new apiError(400,"username is missing")
    }

    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscriberCount:{
                    $size:"subscribers"
                },
                channelsSubscribedToCount:{
                    $size: "subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if: {$in: [req.user?._id,"$subscribers.subscriber"]},
                        then : true,
                        else : false,
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
        
    ])

    if (!channel?.length){
        throw new apiError(404,"Channel does not exists")
    }

    return res
    .status(200)
    .json(
        new apiResponse(200, channel[0], "User channel fetched succesfully")
    )

})

export { 
    registerUser ,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile

}